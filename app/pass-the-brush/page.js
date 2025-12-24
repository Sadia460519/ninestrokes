'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '../components/Header'

export default function PassTheBrushHub() {
  const [user, setUser] = useState(null)
  const [roomCode, setRoomCode] = useState('')
  const [activeRooms, setActiveRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkUser()
    fetchActiveRooms()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    setLoading(false)
  }

  async function fetchActiveRooms() {
    // Fetch rooms where user is a player and game is still active
    if (!user) return

    const { data, error } = await supabase
      .from('pass_the_brush_rooms')
      .select(`
        *,
        pass_the_brush_players!inner(user_id)
      `)
      .eq('pass_the_brush_players.user_id', user.id)
      .in('status', ['waiting', 'topic_selection', 'playing', 'voting'])
      .order('created_at', { ascending: false })

    if (data) setActiveRooms(data)
  }

  async function createRoom() {
  if (!user) {
    router.push('/auth/login')
    return
  }

  // Generate room code (SUNSET47 style)
  const words = ['SUNSET', 'OCEAN', 'FOREST', 'MOUNTAIN', 'RIVER', 'DESERT', 'MEADOW', 'VALLEY', 'CANYON', 'ISLAND']
  const randomWord = words[Math.floor(Math.random() * words.length)]
  const randomNum = Math.floor(Math.random() * 100).toString().padStart(2, '0')
  const code = `${randomWord}${randomNum}`

  // Get user's username from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  const username = profile?.username || user.email?.split('@')[0] || 'Anonymous'

  // Create room in database
  const { data: room, error } = await supabase
    .from('pass_the_brush_rooms')
    .insert({
      room_code: code,
      host_id: user.id,
      status: 'waiting'
    })
    .select()
    .single()

  if (error) {
    setError('Failed to create room. Try again!')
    return
  }

  // Add host as first player WITH USERNAME
  await supabase
    .from('pass_the_brush_players')
    .insert({
      room_id: room.id,
      user_id: user.id,
      username: username,  // ← ADDED THIS!
      turn_order: 1
    })

  // Redirect to room
  router.push(`/pass-the-brush/room/${code}`)
}

  async function joinRoom() {
  if (!user) {
    router.push('/auth/login')
    return
  }

  if (!roomCode.trim()) {
    setError('Please enter a room code!')
    return
  }

  // Get user's username from profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  const username = profile?.username || user.email?.split('@')[0] || 'Anonymous'

  // Check if room exists
  const { data: room, error } = await supabase
    .from('pass_the_brush_rooms')
    .select('*')
    .eq('room_code', roomCode.toUpperCase())
    .single()

  if (error || !room) {
    setError('Room not found! Check the code and try again.')
    return
  }

  // Check if room is full
  const { count } = await supabase
    .from('pass_the_brush_players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id)

  if (count >= 7) {
    setError('Room is full! (Max 7 players)')
    return
  }

  // Check if game already started
  if (room.status === 'playing' || room.status === 'voting') {
    // Join as spectator
    const { data: existingPlayer } = await supabase
      .from('pass_the_brush_players')
      .select('*')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single()

    if (!existingPlayer) {
      await supabase
        .from('pass_the_brush_players')
        .insert({
          room_id: room.id,
          user_id: user.id,
          username: username,  // ← ADDED THIS!
          is_spectator: true
        })
    }
  } else {
    // Join as player
    const { data: existingPlayer } = await supabase
      .from('pass_the_brush_players')
      .select('*')
      .eq('room_id', room.id)
      .eq('user_id', user.id)
      .single()

    if (!existingPlayer) {
      await supabase
        .from('pass_the_brush_players')
        .insert({
          room_id: room.id,
          user_id: user.id,
          username: username,  // ← ADDED THIS!
          turn_order: count + 1,
          is_spectator: false
        })
    }
  }

  // Redirect to room
  router.push(`/pass-the-brush/room/${roomCode.toUpperCase()}`)
}

  if (loading) {
    return (
      <main className="min-h-screen bg-pink-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-pink-50">
        <Header />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">🖌️ Pass the Brush</h1>
          <p className="text-gray-600 mb-8">Please log in to play!</p>
          <Link 
            href="/auth/login"
            className="bg-pink-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-pink-600 inline-block"
          >
            Log In
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-pink-50">
      <Header />
      
      <div className="max-w-4xl mx-auto px-4 py-12">
        
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">🖌️ Pass the Brush</h1>
          <p className="text-xl text-gray-600">Collaborative drawing game - Take turns creating art together!</p>
        </div>

        {/* Main Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          
          {/* Create Room */}
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🎨</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Create Room</h2>
            <p className="text-gray-600 mb-6">Start a new game and invite your friends!</p>
            <button
              onClick={createRoom}
              className="bg-pink-500 text-white px-8 py-3 rounded-lg font-medium hover:bg-pink-600 w-full"
            >
              Create Private Room
            </button>
          </div>

          {/* Join Room */}
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🚪</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Join Room</h2>
            <p className="text-gray-600 mb-6">Enter a room code to join a game!</p>
            
            <input
              type="text"
              placeholder="SUNSET47"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="border border-gray-300 rounded-lg px-4 py-3 w-full mb-3 text-center font-mono text-lg"
              maxLength={10}
            />
            
            {error && (
              <p className="text-red-500 text-sm mb-3">{error}</p>
            )}
            
            <button
              onClick={joinRoom}
              className="bg-gray-800 text-white px-8 py-3 rounded-lg font-medium hover:bg-gray-900 w-full"
            >
              Join Room
            </button>
          </div>
        </div>

        {/* How to Play */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-4">📖 How to Play</h3>
          <div className="space-y-3 text-gray-700">
            <p><strong>1.</strong> Create or join a private room (2-7 players)</p>
            <p><strong>2.</strong> A random player picks the drawing topic</p>
            <p><strong>3.</strong> Take turns drawing on the same canvas (3 minutes each)</p>
            <p><strong>4.</strong> Complete at least 3 rounds together</p>
            <p><strong>5.</strong> Vote to continue or finish after Round 3</p>
            <p><strong>6.</strong> Save the final collaborative masterpiece!</p>
          </div>
        </div>

        {/* Active Rooms */}
        {activeRooms.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">🎮 Your Active Rooms</h3>
            <div className="space-y-3">
              {activeRooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/pass-the-brush/room/${room.room_code}`}
                  className="block p-4 border border-gray-200 rounded-lg hover:bg-pink-50 transition"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-mono font-bold text-lg">{room.room_code}</p>
                      <p className="text-sm text-gray-600">Status: {room.status}</p>
                    </div>
                    <span className="text-pink-500">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}