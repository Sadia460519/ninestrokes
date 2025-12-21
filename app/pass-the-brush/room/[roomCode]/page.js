'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useParams, useRouter } from 'next/navigation'
import Header from '../../../components/Header'
import Link from 'next/link'
import DrawingCanvas from '../../components/DrawingCanvas'

// Topic Picker Component
function TopicPicker({ room, supabase, roomCode }) {
  const [topics, setTopics] = useState([])
  const [customTopic, setCustomTopic] = useState('')
  const [selectedTopic, setSelectedTopic] = useState(null)
  const [timeLeft, setTimeLeft] = useState(30)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchRandomTopics()
    
    // 30 second countdown
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Auto-select random topic if time runs out
          autoSelectTopic()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  async function fetchRandomTopics() {
    // Get 3 random topics
    const { data, error } = await supabase
      .from('drawing_topics')
      .select('*')
      .limit(100)
    
    if (data) {
      // Shuffle and pick 3
      const shuffled = data.sort(() => 0.5 - Math.random())
      setTopics(shuffled.slice(0, 3))
      setLoading(false)
    }
  }

  async function autoSelectTopic() {
    if (selectedTopic) return // Already selected
    
    // Pick first topic automatically
    const topic = topics[0]?.topic_text || 'Free Draw'
    await selectTopic(topic)
  }

  async function selectTopic(topic) {
    setSelectedTopic(topic)

    // Update room with topic and change status to playing
    await supabase
      .from('pass_the_brush_rooms')
      .update({
        topic: topic,
        status: 'playing'
      })
      .eq('id', room.id)
  }

  async function handleCustomTopic() {
    if (!customTopic.trim()) return
    await selectTopic(customTopic.trim())
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-12 text-center">
        <p className="text-gray-600">Loading topics...</p>
      </div>
    )
  }

  if (selectedTopic) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-12 text-center">
        <div className="text-6xl mb-6">✅</div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Topic Selected!</h2>
        <p className="text-2xl text-pink-500 font-bold mb-6">{selectedTopic}</p>
        <p className="text-gray-600">Starting game...</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">Choose Your Drawing Topic!</h2>
        <p className="text-gray-600">You have {timeLeft} seconds to choose</p>
        
        {/* Timer Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
          <div 
            className="bg-pink-500 h-2 rounded-full transition-all duration-1000"
            style={{ width: `${(timeLeft / 30) * 100}%` }}
          />
        </div>
      </div>

      {/* Topic Options */}
      <div className="space-y-3 mb-6">
        {topics.map((topic, index) => (
          <button
            key={topic.id}
            onClick={() => selectTopic(topic.topic_text)}
            className="w-full p-4 border-2 border-gray-200 rounded-lg hover:border-pink-500 hover:bg-pink-50 transition text-left"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {index === 0 ? '🌸' : index === 1 ? '🎨' : '✨'}
              </span>
              <div className="flex-1">
                <p className="font-bold text-lg text-gray-900">{topic.topic_text}</p>
                <p className="text-sm text-gray-500 capitalize">{topic.category}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Custom Topic */}
      <div className="border-t-2 border-gray-200 pt-6">
        <p className="font-bold text-gray-900 mb-3">✏️ Or choose your own:</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Type your own topic..."
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            maxLength={100}
            className="flex-1 border border-gray-300 rounded-lg px-4 py-3"
            onKeyPress={(e) => e.key === 'Enter' && handleCustomTopic()}
          />
          <button
            onClick={handleCustomTopic}
            disabled={!customTopic.trim()}
            className="bg-pink-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-pink-600 disabled:bg-gray-300"
          >
            Choose
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">{customTopic.length}/100 characters</p>
      </div>
    </div>
  )
}

export default function GameRoom() {
  const params = useParams()
  const router = useRouter()
  const roomCode = params.roomCode

  const [user, setUser] = useState(null)
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [isHost, setIsHost] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [currentTurn, setCurrentTurn] = useState(null)
const [timeLeft, setTimeLeft] = useState(180) // 3 minutes = 180 seconds
const [canvasData, setCanvasData] = useState(null)
const [comments, setComments] = useState([])
const [newComment, setNewComment] = useState('')

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
  if (user) {
    fetchRoomData()
    
    // Real-time subscription
    let cleanup
    if (room) {
      cleanup = subscribeToRoom()
    }
    
    // Backup polling every 2 seconds (in case realtime doesn't work)
    const pollInterval = setInterval(() => {
      fetchRoomData()
    }, 2000)
    
    return () => {
      if (cleanup) cleanup()
      clearInterval(pollInterval)
    }
  }
}, [user, room?.id])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/auth/login')
      return
    }
    setUser(user)
  }

  async function fetchRoomData() {
    // Fetch room
    const { data: roomData, error: roomError } = await supabase
      .from('pass_the_brush_rooms')
      .select('*')
      .eq('room_code', roomCode)
      .single()

    if (roomError || !roomData) {
      setError('Room not found!')
      setLoading(false)
      return
    }

    setRoom(roomData)
    setIsHost(roomData.host_id === user.id)

    // Fetch players
    const { data: playersData } = await supabase
      .from('pass_the_brush_players')
      .select(`
        *,
        profiles(username, avatar_url)
      `)
      .eq('room_id', roomData.id)
      .order('turn_order')

    if (playersData) setPlayers(playersData)
    setLoading(false)
  }

  function subscribeToRoom() {
  if (!room) return

  console.log('🔔 Subscribing to room updates:', room.id)

  // Real-time updates for players joining/leaving and room status changes
  const channel = supabase
    .channel(`room:${room.id}`, {
      config: {
        broadcast: { self: true }
      }
    })
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pass_the_brush_players',
        filter: `room_id=eq.${room.id}`
      },
      (payload) => {
        console.log('🔄 Player change detected:', payload)
        fetchRoomData()
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'pass_the_brush_rooms',
        filter: `id=eq.${room.id}`
      },
      (payload) => {
        console.log('🔄 Room update detected:', payload)
        fetchRoomData()
      }
    )
    .subscribe((status) => {
      console.log('📡 Subscription status:', status)
    })

  return () => {
    console.log('🔕 Unsubscribing from room')
    supabase.removeChannel(channel)
  }
}

  

    async function startGame() {
  console.log('🎮 Start Game clicked!')
  console.log('Is Host:', isHost)
  console.log('Room:', room)
  console.log('Players:', players)

  if (!isHost) {
    console.log('❌ Not host, cannot start')
    return
  }

  // Check minimum players
  const activePlayers = players.filter(p => !p.is_spectator)
  console.log('Active players:', activePlayers.length)

  if (activePlayers.length < 2) {
    setError('Need at least 2 players to start!')
    console.log('❌ Not enough players')
    return
  }

  // Choose random topic picker
  const randomPicker = activePlayers[Math.floor(Math.random() * activePlayers.length)]
  console.log('🎲 Random picker:', randomPicker)

  // Update room status
  console.log('📝 Updating room status...')
  const { data, error } = await supabase
    .from('pass_the_brush_rooms')
    .update({
      status: 'topic_selection',
      topic_picker_id: randomPicker.user_id,
      started_at: new Date().toISOString()
    })
    .eq('id', room.id)

  console.log('✅ Update result:', { data, error })

  if (error) {
    console.error('❌ Error updating room:', error)
    setError('Failed to start game!')
  } else {
    console.log('🎉 Game started successfully!')
  }
}

  if (loading) {
    return (
      <main className="min-h-screen bg-pink-50">
        <Header />
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600">Loading room...</p>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="min-h-screen bg-pink-50">
        <Header />
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <p className="text-red-500 text-xl mb-4">{error}</p>
          <Link 
            href="/pass-the-brush"
            className="text-pink-500 hover:underline"
          >
            ← Back to Hub
          </Link>
        </div>
      </main>
    )
  }

  // Waiting Room
  if (room.status === 'waiting') {
    return (
      <main className="min-h-screen bg-pink-50">
        <Header />
        
        <div className="max-w-4xl mx-auto px-4 py-12">
          
          {/* Room Header */}
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">🖌️ Waiting Room</h1>
                <p className="text-gray-600 mt-2">Share this code with friends:</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Room Code</p>
                <p className="text-4xl font-mono font-bold text-pink-500">{roomCode}</p>
              </div>
            </div>
          </div>

          {/* Players */}
          <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              👥 Players ({players.filter(p => !p.is_spectator).length}/7)
            </h2>
            
            <div className="space-y-3">
              {players.filter(p => !p.is_spectator).map((player, index) => (
                <div 
                  key={player.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center text-lg font-bold text-pink-600">
                    {player.profiles?.avatar_url ? (
                      <img 
                        src={player.profiles.avatar_url} 
                        alt={player.profiles.username}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      player.profiles?.username?.charAt(0).toUpperCase()
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">
                      {player.profiles?.username}
                      {player.user_id === room.host_id && (
                        <span className="ml-2 text-xs bg-pink-100 text-pink-600 px-2 py-1 rounded">
                          HOST
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">Turn {index + 1}</p>
                  </div>
                </div>
              ))}
            </div>

            {players.filter(p => !p.is_spectator).length < 2 && (
              <p className="text-yellow-600 text-sm mt-4 bg-yellow-50 p-3 rounded">
                ⚠️ Need at least 2 players to start
              </p>
            )}
          </div>

          {/* Spectators */}
          {players.filter(p => p.is_spectator).length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                👁️ Spectators ({players.filter(p => p.is_spectator).length})
              </h2>
              <div className="space-y-2">
                {players.filter(p => p.is_spectator).map((spectator) => (
                  <div key={spectator.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded">
                    <p className="text-sm text-gray-600">{spectator.profiles?.username}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            {isHost ? (
              <button
                onClick={startGame}
                disabled={players.filter(p => !p.is_spectator).length < 2}
                className="bg-pink-500 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-pink-600 w-full disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                🎮 Start Game
              </button>
            ) : (
              <div className="text-center text-gray-600">
                <p>Waiting for host to start the game...</p>
              </div>
            )}
          </div>

          {/* Back Link */}
          <div className="text-center mt-6">
            <Link 
              href="/pass-the-brush"
              className="text-pink-500 hover:underline"
            >
              ← Leave Room
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Topic Selection
if (room.status === 'topic_selection') {
  const isPicker = user.id === room.topic_picker_id
  const pickerPlayer = players.find(p => p.user_id === room.topic_picker_id)

  return (
    <main className="min-h-screen bg-pink-50">
      <Header />
      
      <div className="max-w-4xl mx-auto px-4 py-12">
        {isPicker ? (
          <TopicPicker 
            room={room} 
            supabase={supabase}
            roomCode={roomCode}
          />
        ) : (
          <div className="bg-white rounded-lg shadow-lg p-12 text-center">
            <div className="text-6xl mb-6">⏳</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Waiting for Topic Selection
            </h2>
            <p className="text-xl text-gray-600 mb-2">
              <span className="font-bold text-pink-500">
                {pickerPlayer?.profiles?.username}
              </span>
              {' '}is choosing the drawing topic...
            </p>
            <p className="text-sm text-gray-500 mt-4">Get ready to draw!</p>
          </div>
        )}
      </div>
    </main>
  )
}

// Playing State - Drawing Screen
if (room.status === 'playing') {
  // Determine current turn
  useEffect(() => {
    if (room && players.length > 0) {
      // Calculate which player's turn it is based on round and turn count
      const activePlayers = players.filter(p => !p.is_spectator).sort((a, b) => a.turn_order - b.turn_order)
      
      // For now, let's start with first player
      // TODO: Add proper turn rotation logic
      const currentPlayer = activePlayers[0]
      setCurrentTurn(currentPlayer)
    }
  }, [room, players])

  // Timer countdown
  useEffect(() => {
    if (room.status !== 'playing') return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time's up - pass to next player
          // TODO: Implement turn passing
          return 180
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [room.status])

  // Fetch comments
  useEffect(() => {
    if (room) {
      fetchComments()
      subscribeToComments()
    }
  }, [room])

  async function fetchComments() {
    const { data } = await supabase
      .from('pass_the_brush_comments')
      .select(`
        *,
        profiles(username, avatar_url)
      `)
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })

    if (data) setComments(data)
  }

  function subscribeToComments() {
    const channel = supabase
      .channel(`comments:${room.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pass_the_brush_comments',
          filter: `room_id=eq.${room.id}`
        },
        () => {
          fetchComments()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  async function handleSendComment() {
    if (!newComment.trim()) return

    await supabase
      .from('pass_the_brush_comments')
      .insert({
        room_id: room.id,
        user_id: user.id,
        comment_text: newComment.trim()
      })

    setNewComment('')
  }

  async function handleStrokeAdd(strokeData) {
    // Save stroke to database
    // TODO: Implement stroke saving
    console.log('New stroke:', strokeData)
  }

  const isMyTurn = currentTurn?.user_id === user.id
  const activePlayers = players.filter(p => !p.is_spectator)

  // Format time
  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  return (
    <main className="min-h-screen bg-pink-50">
      <Header />
      
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* Left Sidebar - Players */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-4 sticky top-4">
              <h3 className="font-bold text-lg mb-4">👥 Players</h3>
              
              <div className="space-y-2">
                {activePlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className={`p-3 rounded-lg ${
                      player.user_id === currentTurn?.user_id
                        ? 'bg-pink-100 border-2 border-pink-500'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-pink-200 flex items-center justify-center text-sm font-bold">
                        {player.profiles?.username?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {player.profiles?.username}
                        </p>
                        <p className="text-xs text-gray-500">Turn {index + 1}</p>
                      </div>
                      {player.user_id === currentTurn?.user_id && (
                        <span className="text-pink-500">🖌️</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Round Info */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-600">Round: {room.current_round}</p>
                <p className="text-sm text-gray-600">Room: {roomCode}</p>
              </div>
            </div>
          </div>

          {/* Center - Canvas */}
          <div className="lg:col-span-2">
            {/* Turn Indicator */}
            <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
              <div className="flex justify-between items-center">
                <div>
                  {isMyTurn ? (
                    <p className="text-xl font-bold text-pink-600">
                      🎨 Your turn to draw!
                    </p>
                  ) : (
                    <p className="text-xl font-bold text-gray-700">
                      🎨 {currentTurn?.profiles?.username} is drawing...
                    </p>
                  )}
                </div>
                
                {/* Timer */}
                <div className="text-right">
                  <p className="text-sm text-gray-500">Time Left</p>
                  <p className={`text-3xl font-mono font-bold ${
                    timeLeft < 30 ? 'text-red-500' : 'text-gray-900'
                  }`}>
                    {minutes}:{seconds.toString().padStart(2, '0')}
                  </p>
                </div>
              </div>
            </div>

            {/* Drawing Canvas */}
            <DrawingCanvas
              isMyTurn={isMyTurn}
              canvasData={canvasData}
              onStrokeAdd={handleStrokeAdd}
              room={room}
            />
          </div>

          {/* Right Sidebar - Chat */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-lg p-4 sticky top-4 h-[800px] flex flex-col">
              <h3 className="font-bold text-lg mb-4">💬 Chat</h3>
              
              {/* Comments */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                {comments.map((comment) => (
                  <div key={comment.id} className="text-sm">
                    <p className="font-medium text-gray-900">
                      {comment.profiles?.username}
                    </p>
                    <p className="text-gray-700">{comment.comment_text}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(comment.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                ))}
              </div>

              {/* Comment Input */}
              <div className="border-t pt-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendComment()}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={handleSendComment}
                    className="bg-pink-500 text-white px-4 py-2 rounded-lg hover:bg-pink-600"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

// Other states
return (
  <main className="min-h-screen bg-pink-50">
    <Header />
    <div className="max-w-6xl mx-auto px-4 py-12 text-center">
      <p className="text-gray-600">Game in progress... (Status: {room.status})</p>
    </div>
  </main>
)
}