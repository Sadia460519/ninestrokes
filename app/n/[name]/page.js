'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function CommunityPage({ params: paramsPromise }) {
  const params = React.use(paramsPromise)
  const [community, setCommunity] = useState(null)
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCommunity()
    fetchArtworks()
  }, [])

  async function fetchCommunity() {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .eq('name', params.name)
      .single()
    
    if (error) {
      console.error('Error:', error)
    } else {
      setCommunity(data)
    }
  }

  async function fetchArtworks() {
    // First get the community ID
    const { data: communityData } = await supabase
      .from('communities')
      .select('id')
      .eq('name', params.name)
      .single()

    if (!communityData) {
      setLoading(false)
      return
    }

    // Then fetch artworks for this community
    const { data, error } = await supabase
      .from('artworks')
      .select(`
        *,
        profiles (username)
      `)
      .eq('community_id', communityData.id)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error:', error)
    } else {
      setArtworks(data)
    }
    setLoading(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-pink-50 p-8">
        <p>Loading...</p>
      </main>
    )
  }

  if (!community) {
    return (
      <main className="min-h-screen bg-pink-50 p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900">Community not found</h1>
          <Link href="/" className="text-pink-500 hover:underline mt-4 block">
            ← Back to home
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-pink-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-3xl font-bold text-gray-900">
            NineStrokes
          </Link>
          <div className="flex gap-4">
            <Link 
              href="/upload"
              className="bg-pink-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-pink-600"
            >
              Upload Art
            </Link>
            <Link 
              href="/auth/login"
              className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300"
            >
              Login
            </Link>
          </div>
        </div>
      </header>

      {/* Community Header */}
      <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <h1 className="text-4xl font-bold mb-2">/n/{community.name}</h1>
          <h2 className="text-2xl mb-2">{community.display_name}</h2>
          <p className="text-lg opacity-90">{community.description}</p>
          <div className="mt-4 flex gap-6 text-sm">
            <span>📊 {artworks.length} artworks</span>
            <span>👥 {community.member_count} members</span>
          </div>
        </div>
      </div>

      {/* Artworks Grid */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {artworks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg mb-4">No artworks in this community yet!</p>
            <Link 
              href="/upload"
              className="text-pink-500 font-medium hover:underline"
            >
              Be the first to post →
            </Link>
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
                    <p className="text-sm text-gray-600 mb-2">
                      by {artwork.profiles?.username || 'Unknown'}
                    </p>
                    
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                      <span>❤️ {artwork.stroke_count} strokes</span>
                      <span>💬 {artwork.comment_count} comments</span>
                      {artwork.mode === 'sketch' && (
                        <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                          WIP
                        </span>
                      )}
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