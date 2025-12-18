'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import Header from '@/app/components/Header'


export default function ProfilePage({ params: paramsPromise }) {
  const params = React.use(paramsPromise)
  const [profile, setProfile] = useState(null)
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    fetchProfile()
    fetchArtworks()
    checkCurrentUser()
  }, [])

  async function fetchProfile() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', params.username)
      .single()
    
    if (error) {
      console.error('Error:', error)
    } else {
      setProfile(data)
    }
    setLoading(false)
  }

  async function fetchArtworks() {
    // First get the user's ID from their username
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', params.username)
      .single()

    if (!profileData) return

    // Then fetch their artworks
    const { data, error } = await supabase
      .from('artworks')
      .select(`
        *,
        profiles (username)
      `)
      .eq('user_id', profileData.id)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error:', error)
    } else {
      setArtworks(data)
    }
  }
  async function checkCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  setCurrentUser(user)
}

  if (loading) {
    return (
      <main className="min-h-screen bg-pink-50 p-8">
        <p>Loading profile...</p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-pink-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900">User not found</h1>
          <Link href="/" className="text-pink-500 hover:underline mt-4 block">
            ← Back to home
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-pink-50">
      <Header />

      {/* Profile Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-start gap-6">
            
            
            {/* Avatar */}
<div className="w-24 h-24 bg-pink-200 rounded-full flex items-center justify-center text-4xl font-bold text-pink-600 overflow-hidden">
  {profile.avatar_url ? (
    <img 
      src={profile.avatar_url} 
      alt={profile.username}
      className="w-full h-full object-cover"
    />
  ) : (
    profile.username.charAt(0).toUpperCase()
  )}
</div>

            {/* Profile Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {profile.username}
              </h1>
              
              {profile.bio && (
                <p className="text-gray-700 mb-4">
                  {profile.bio}
                </p>
              )}

              {/* Stats */}
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="font-bold text-gray-900">{artworks.length}</span>
                  <span className="text-gray-600"> artworks</span>
                </div>
                <div>
                  <span className="font-bold text-gray-900">{profile.total_strokes}</span>
                  <span className="text-gray-600"> strokes received</span>
                </div>
                <div>
                  <span className="text-gray-600">Joined {new Date(profile.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              {/* Edit Profile Button - Only show if viewing your own profile */}
{currentUser && currentUser.id === profile.id && (
  <Link 
    href="/profile/edit"
    className="mt-4 inline-block bg-pink-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-pink-600"
  >
    Edit Profile
  </Link>
)}
            </div>
          </div>
        </div>
      </div>

      {/* Artworks Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Artworks</h2>

        {artworks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">No artworks yet!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {artworks.map((artwork) => (
              <Link href={`/artwork/${artwork.id}`} key={artwork.id}>
                <div className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition cursor-pointer">
                  <img 
                    src={artwork.image_url} 
                    alt={artwork.title}
                    className="w-full h-64 object-cover"
                  />
                  
                  <div className="p-4">
                    <h3 className="font-bold text-lg text-gray-900 mb-1">
                      {artwork.title}
                    </h3>
                    
                    {artwork.description && (
                      <p className="text-sm text-gray-700 line-clamp-2 mb-2">
                        {artwork.description}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>❤️ {artwork.stroke_count} strokes</span>
                      <span>💬 {artwork.comment_count} comments</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}