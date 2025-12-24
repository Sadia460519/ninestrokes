'use client';

import DrawingCanvas from '../../components/DrawingCanvas';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabase';


export default function GameRoom() {
  const params = useParams();
  const router = useRouter();
  const roomCode = params.roomCode;
  

  // State management
  const [user, setUser] = useState(null);
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [gameState, setGameState] = useState('waiting');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState('');
  const [topicOptions, setTopicOptions] = useState([]);
  const [currentTurn, setCurrentTurn] = useState(1);
  const [maxTurns, setMaxTurns] = useState(3);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [canvasData, setCanvasData] = useState(null);

  // Refs for realtime subscriptions
  const roomChannelRef = useRef(null);
  const messagesChannelRef = useRef(null);
  const timerRef = useRef(null);

  // Debug logging helper
  const debugLog = useCallback((context, data) => {
    console.log(`[PassTheBrush Debug - ${context}]:`, {
      timestamp: new Date().toISOString(),
      roomCode,
      userId: user?.id,
      ...data
    });
  }, [roomCode, user?.id]);

  // Initialize user and room
  useEffect(() => {
    const initializeGame = async () => {
      try {
        debugLog('Initialize', { action: 'starting' });
        
        // Get current user
        const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
        
        if (userError) throw userError;
        if (!currentUser) {
          debugLog('Initialize', { error: 'No authenticated user' });
          router.push('/pass-the-brush');
          return;
        }

        setUser(currentUser);
        debugLog('Initialize', { user: currentUser.id });

        // Fetch room data
        const { data: roomData, error: roomError } = await supabase
          .from('pass_the_brush_rooms')
          .select('*')
          .eq('room_code', roomCode)
          .single();

        if (roomError) {
          debugLog('Initialize', { error: 'Room fetch failed', details: roomError });
          throw new Error('Room not found');
        }

        if (!roomData) {
          debugLog('Initialize', { error: 'Room does not exist' });
          throw new Error('Room does not exist');
        }

        setRoom(roomData);
        setGameState(roomData.game_state || roomData.status || 'waiting');
        setCurrentTurn(roomData.current_turn || 1);
        setMaxTurns(roomData.max_turns || 3);
        
        debugLog('Initialize', { 
          room: roomData.id, 
          gameState: roomData.game_state || roomData.status,
          currentTurn: roomData.current_turn 
        });

        // Fetch players
        await fetchPlayers(roomData.id);

        // Fetch messages
        await fetchMessages(roomData.id);

        setLoading(false);
        debugLog('Initialize', { action: 'completed' });

      } catch (err) {
        debugLog('Initialize', { error: err.message });
        setError(err.message);
        setLoading(false);
      }
    };

    initializeGame();
  }, [roomCode]);

  // Fetch players
  const fetchPlayers = async (roomId) => {
    try {
      debugLog('FetchPlayers', { action: 'starting', roomId });
      
      const { data, error } = await supabase
        .from('pass_the_brush_players')
        .select('*')
        .eq('room_id', roomId)
        .order('joined_at', { ascending: true });

      if (error) throw error;

      setPlayers(data || []);
      
      // Find current player
      const current = data?.find(p => p.is_current_turn) || data?.[0];
      setCurrentPlayer(current);
      
      debugLog('FetchPlayers', { 
        count: data?.length, 
        currentPlayer: current?.id,
        players: data?.map(p => ({ id: p.id, username: p.username, isTurn: p.is_current_turn }))
      });

    } catch (err) {
      debugLog('FetchPlayers', { error: err.message });
      console.error('Error fetching players:', err);
    }
  };

  // Fetch messages
  const fetchMessages = async (roomId) => {
    try {
      debugLog('FetchMessages', { action: 'starting', roomId });
      
      const { data, error } = await supabase
        .from('pass_the_brush_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
      debugLog('FetchMessages', { count: data?.length });

    } catch (err) {
      debugLog('FetchMessages', { error: err.message });
      console.error('Error fetching messages:', err);
    }
  };

  // Setup realtime subscriptions
  useEffect(() => {
    if (!room || !user) return;

    debugLog('Realtime', { action: 'setting up subscriptions' });

    // Room updates subscription
    roomChannelRef.current = supabase
      .channel(`room:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pass_the_brush_rooms',
          filter: `id=eq.${room.id}`
        },
        (payload) => {
          debugLog('Realtime Room Update', { 
            event: payload.eventType,
            newState: payload.new?.game_state || payload.new?.status,
            currentTurn: payload.new?.current_turn
          });
          
          if (payload.new) {
            setRoom(payload.new);
            setGameState(payload.new.game_state || payload.new.status || 'waiting');
            setCurrentTurn(payload.new.current_turn || 1);
            setMaxTurns(payload.new.max_turns || 3);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pass_the_brush_players',
          filter: `room_id=eq.${room.id}`
        },
        () => {
          debugLog('Realtime Player Update', { action: 'refetching players' });
          fetchPlayers(room.id);
        }
      )
      .subscribe((status) => {
        debugLog('Realtime Room Channel', { status });
      });

    // Messages subscription
    messagesChannelRef.current = supabase
      .channel(`messages:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pass_the_brush_messages',
          filter: `room_id=eq.${room.id}`
        },
        (payload) => {
          debugLog('Realtime New Message', { from: payload.new.username });
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe((status) => {
        debugLog('Realtime Messages Channel', { status });
      });

    return () => {
      debugLog('Realtime', { action: 'cleaning up subscriptions' });
      if (roomChannelRef.current) {
        supabase.removeChannel(roomChannelRef.current);
      }
      if (messagesChannelRef.current) {
        supabase.removeChannel(messagesChannelRef.current);
      }
    };
  }, [room, user]);

  // Timer management
  useEffect(() => {
    if (!room?.turn_end_time) {
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const endTime = new Date(room.turn_end_time).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
      
      setTimeRemaining(remaining);

      if (remaining === 0) {
        debugLog('Timer', { action: 'time expired' });
        clearInterval(timerRef.current);
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [room?.turn_end_time]);

  // Generate topic options
  const generateTopicOptions = useCallback(() => {
    const topics = [
      'A cat wearing a hat',
      'A robot dancing',
      'A flying pizza',
      'A dragon sleeping',
      'A superhero at the beach',
      'An alien cooking dinner',
      'A pirate playing guitar',
      'A wizard riding a bicycle',
      'A dinosaur gardening',
      'A ninja eating ice cream'
    ];

    const shuffled = [...topics].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);
    
    debugLog('TopicGeneration', { topics: selected });
    setTopicOptions(selected);
    return selected;
  }, [debugLog]);

  // Start game handler
  const handleStartGame = async () => {
    try {
      debugLog('StartGame', { action: 'starting', isHost: room?.host_id === user?.id });
      
      if (room?.host_id !== user?.id) {
        throw new Error('Only the host can start the game');
      }

      if (players.length < 1) {
  throw new Error('Need at least 1 player to start');
}

      const topics = generateTopicOptions();

      const { error: updateError } = await supabase
        .from('pass_the_brush_rooms')
        .update({
          game_state: 'topic_selection',
          status: 'topic_selection',
          current_turn: 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);

      if (updateError) {
        debugLog('StartGame', { error: 'Update failed', details: updateError });
        throw updateError;
      }

      debugLog('StartGame', { action: 'completed', newState: 'topic_selection' });

    } catch (err) {
      debugLog('StartGame', { error: err.message });
      alert(err.message);
    }
  };

  // Topic selection handler
  const handleTopicSelect = async (topic) => {
    try {
      debugLog('TopicSelect', { topic, playerId: user?.id });
      
      if (room?.host_id !== user?.id) {
        throw new Error('Only the host can select the topic');
      }

      setSelectedTopic(topic);

      // Calculate turn end time (60 seconds from now)
      const turnEndTime = new Date(Date.now() + 60000).toISOString();

      const { error: updateError } = await supabase
        .from('pass_the_brush_rooms')
        .update({
          game_state: 'playing',
          status: 'playing',
          current_topic: topic,
          topic: topic,
          turn_end_time: turnEndTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);

      if (updateError) {
        debugLog('TopicSelect', { error: 'Update failed', details: updateError });
        throw updateError;
      }

      // Set first player as current turn
      const firstPlayer = players[0];
      if (firstPlayer) {
        const { error: playerError } = await supabase
          .from('pass_the_brush_players')
          .update({ is_current_turn: true })
          .eq('id', firstPlayer.id);

        if (playerError) {
          debugLog('TopicSelect', { error: 'Player update failed', details: playerError });
        }
      }

      debugLog('TopicSelect', { 
        action: 'completed', 
        topic, 
        newState: 'playing',
        turnEndTime 
      });

    } catch (err) {
      debugLog('TopicSelect', { error: err.message });
      alert(err.message);
    }
  };

  // Pass turn handler
  const handlePassTurn = async () => {
    try {
      debugLog('PassTurn', { 
        currentPlayer: currentPlayer?.id, 
        userId: user?.id,
        currentTurn 
      });

      if (currentPlayer?.user_id !== user?.id) {
        throw new Error('It is not your turn');
      }

      // Find current player index
      const currentIndex = players.findIndex(p => p.is_current_turn);
      if (currentIndex === -1) {
        debugLog('PassTurn', { error: 'No current player found' });
        throw new Error('Could not determine current player');
      }

      // Calculate next player
      const nextIndex = (currentIndex + 1) % players.length;
      const nextPlayer = players[nextIndex];

      debugLog('PassTurn', { 
        currentIndex, 
        nextIndex, 
        nextPlayer: nextPlayer?.id 
      });

      // Check if round is complete
      const isRoundComplete = nextIndex === 0;
      const newTurn = isRoundComplete ? currentTurn + 1 : currentTurn;
      const isGameOver = newTurn > maxTurns;

      if (isGameOver) {
        debugLog('PassTurn', { action: 'game over', finalTurn: newTurn });
        
        const { error: gameOverError } = await supabase
          .from('pass_the_brush_rooms')
          .update({
            game_state: 'voting',
            status: 'voting',
            turn_end_time: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', room.id);

        if (gameOverError) throw gameOverError;
        return;
      }

      // Update current player turn status
      const { error: currentPlayerError } = await supabase
        .from('pass_the_brush_players')
        .update({ is_current_turn: false })
        .eq('id', players[currentIndex].id);

      if (currentPlayerError) {
        debugLog('PassTurn', { error: 'Current player update failed', details: currentPlayerError });
        throw currentPlayerError;
      }

      // Update next player turn status
      const { error: nextPlayerError } = await supabase
        .from('pass_the_brush_players')
        .update({ is_current_turn: true })
        .eq('id', nextPlayer.id);

      if (nextPlayerError) {
        debugLog('PassTurn', { error: 'Next player update failed', details: nextPlayerError });
        throw nextPlayerError;
      }

      // Calculate new turn end time
      const newTurnEndTime = new Date(Date.now() + 60000).toISOString();

      // Update room
      const { error: roomUpdateError } = await supabase
        .from('pass_the_brush_rooms')
        .update({
          current_turn: newTurn,
          turn_end_time: newTurnEndTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);

      if (roomUpdateError) {
        debugLog('PassTurn', { error: 'Room update failed', details: roomUpdateError });
        throw roomUpdateError;
      }

      debugLog('PassTurn', { 
        action: 'completed', 
        newTurn, 
        nextPlayer: nextPlayer?.username 
      });

    } catch (err) {
      debugLog('PassTurn', { error: err.message });
      alert(err.message);
    }
  };

  // Send message handler
  const handleSendMessage = async (e) => {
  e.preventDefault();
  
  if (!newMessage.trim()) return;

  try {
    debugLog('SendMessage', { message: newMessage.substring(0, 50), roomId: room?.id });

    const player = players.find(p => p.user_id === user?.id);
    if (!player) {
      throw new Error('Player not found');
    }

    if (!room?.id) {
      throw new Error('Room ID is missing');
    }

    const { error } = await supabase
      .from('pass_the_brush_messages')
      .insert({
        room_id: room.id,  // Make sure this is the UUID
        user_id: user.id,
        username: player.username || 'Anonymous',
        message: newMessage.trim()
      });

    if (error) {
      debugLog('SendMessage', { error: 'Insert failed', details: error });
      throw error;
    }

    setNewMessage('');
    debugLog('SendMessage', { action: 'completed' });

  } catch (err) {
    debugLog('SendMessage', { error: err.message });
    console.error('Error sending message:', err);
  }
};

  // Leave room handler
  const handleLeaveRoom = async () => {
    try {
      debugLog('LeaveRoom', { action: 'starting' });

      const player = players.find(p => p.user_id === user?.id);
      if (player) {
        const { error } = await supabase
          .from('pass_the_brush_players')
          .delete()
          .eq('id', player.id);

        if (error) {
          debugLog('LeaveRoom', { error: 'Delete failed', details: error });
        }
      }

      debugLog('LeaveRoom', { action: 'completed' });
      router.push('/pass-the-brush');

    } catch (err) {
      debugLog('LeaveRoom', { error: err.message });
      router.push('/pass-the-brush');
    }
  };

  // Canvas update handler
  const handleCanvasUpdate = useCallback((canvasJSON) => {
    debugLog('CanvasUpdate', { hasData: !!canvasJSON });
    setCanvasData(canvasJSON);
  }, [debugLog]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game room...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-6">{error}</p>
          <button
            onClick={() => router.push('/pass-the-brush')}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  const isHost = room?.host_id === user?.id;
  const isMyTurn = currentPlayer?.user_id === user?.id;
  const currentPlayerData = players.find(p => p.user_id === user?.id);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Pass the Brush</h1>
              <p className="text-sm text-gray-600">Room Code: <span className="font-mono font-bold">{roomCode}</span></p>
            </div>
            <div className="flex items-center gap-4">
              {gameState === 'playing' && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">Turn {currentTurn} of {maxTurns}</p>
                  {timeRemaining !== null && (
                    <p className="text-lg font-bold text-blue-600">{timeRemaining}s</p>
                  )}
                </div>
              )}
              <button
                onClick={handleLeaveRoom}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Waiting State */}
            {gameState === 'waiting' && (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Waiting for Players...</h2>
                <p className="text-gray-600 mb-6">
                  {players.length} / 7 players joined
                </p>
                {isHost ? (
                  <button
  onClick={handleStartGame}
  disabled={players.length < 1}
  className={`px-8 py-3 rounded-lg font-semibold text-lg ${
    players.length < 1
      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
      : 'bg-blue-600 text-white hover:bg-blue-700'
  }`}
>
  {players.length < 1 ? 'Need at least 1 player' : 'Start Game'}
</button>
                ) : (
                  <p className="text-gray-500">Waiting for host to start the game...</p>
                )}
              </div>
            )}

            {/* Topic Selection State */}
            {gameState === 'topic_selection' && (
              <div className="bg-white rounded-lg shadow-md p-8">
                <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center">Choose a Drawing Topic</h2>
                {isHost ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(topicOptions.length > 0 ? topicOptions : generateTopicOptions()).map((topic, index) => (
                      <button
                        key={index}
                        onClick={() => handleTopicSelect(topic)}
                        className="p-6 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <p className="text-lg font-semibold text-gray-900">{topic}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-600">Waiting for host to select a topic...</p>
                )}
              </div>
            )}

            {/* Playing State */}
            {gameState === 'playing' && (
              <div className="space-y-4">
                <div className="bg-white rounded-lg shadow-md p-4">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Topic: {room?.current_topic || room?.topic}</h3>
                      <p className="text-sm text-gray-600">
                        {isMyTurn ? "It's your turn!" : `${currentPlayer?.username}'s turn`}
                      </p>
                    </div>
                    {isMyTurn && (
                      <button
                        onClick={handlePassTurn}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold"
                      >
                        Pass Turn →
                      </button>
                    )}
                  </div>
                  <DrawingCanvas
  roomId={room.id}
  isMyTurn={isMyTurn}
  onCanvasUpdate={handleCanvasUpdate}
/>
                </div>
              </div>
            )}

            {/* Voting State */}
            {gameState === 'voting' && (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">Game Complete!</h2>
                <p className="text-gray-600 mb-6">Voting feature coming soon...</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Players List */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Players ({players.length})</h3>
              <div className="space-y-2">
                {players.map((player, index) => (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg ${
                      player.is_current_turn
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {index === 0 && <span className="text-yellow-500">👑</span>}
                        <span className="font-semibold text-gray-900">
                          {player.username}
                        </span>
                        {player.user_id === user?.id && (
                          <span className="text-xs text-gray-500">(You)</span>
                        )}
                      </div>
                      {player.is_current_turn && (
                        <span className="text-xs font-semibold text-blue-600">Drawing...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat */}
            <div className="bg-white rounded-lg shadow-md p-6 flex flex-col h-96">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Chat</h3>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {messages.map((msg) => (
                  <div key={msg.id} className="text-sm">
                    <span className="font-semibold text-gray-900">{msg.username}:</span>{' '}
                    <span className="text-gray-700">{msg.message}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}