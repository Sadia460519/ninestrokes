'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Header() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
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
        .select('username, avatar_url')
        .eq('id', user.id)
        .single()
      
      setProfile(data)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setDropdownOpen(false)
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
            <div className="relative">
              {/* Profile Picture Button */}
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="w-10 h-10 rounded-full overflow-hidden bg-pink-200 flex items-center justify-center text-lg font-bold text-pink-600 hover:ring-2 hover:ring-pink-500"
              >
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt={profile.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  profile?.username?.charAt(0).toUpperCase()
                )}
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                  <Link 
                    href={`/profile/${profile?.username}`}
                    className="block px-4 py-2 text-gray-700 hover:bg-pink-50"
                    onClick={() => setDropdownOpen(false)}
                  >
                    View Profile
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-gray-700 hover:bg-pink-50"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
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