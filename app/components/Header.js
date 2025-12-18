'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Header() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const router = useRouter()

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)

    if (user) {
      // Get user's profile
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single()
      
      setProfile(data)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    router.push('/')
    router.refresh()
  }

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/">
          <div className="cursor-pointer">
            <h1 className="text-3xl font-bold text-gray-900">NineStrokes</h1>
            <p className="text-gray-600">Where artists thrive 🎨</p>
          </div>
        </Link>
        
        <div className="flex gap-4 items-center">
          <Link 
            href="/upload"
            className="bg-pink-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-pink-600"
          >
            Upload Art
          </Link>
          
          {user ? (
            <>
              <Link 
                href={`/profile/${profile?.username}`}
                className="text-gray-700 hover:text-pink-500 font-medium"
              >
                {profile?.username}
              </Link>
              <button
                onClick={handleLogout}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300"
              >
                Logout
              </button>
            </>
          ) : (
            <Link 
              href="/auth/login"
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}