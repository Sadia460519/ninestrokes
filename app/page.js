'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function Home() {
  const [artworks, setArtworks] = useState([])
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    fetchArtworks()
    fetchCommunities()
  }, [])

  async function fetchArtworks() {
    const { data, error } = await supabase
      .from('artworks')
      .select(`
        *,
        profiles (username)
      `)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error:', error)
    } else {
      setArtworks(data)
    }
    setLoading(false)
  }

  async function fetchCommunities() {
    const { data, error } = await supabase
      .from('communities')
      .select('*')
      .order('name')
    
    if (error) {
      console.error('Error:', error)
    } else {
      setCommunities(data)
    }
  }

  const communityIcons = {
    watercolor: '🎨',
    digital: '💻',
    photography: '📸',
    sketches: '✏️',
    traditional: '🖌️',
    abstract: '🌀'
  }

  return (
    <main className="min-h-screen bg-pink-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">NineStrokes</h1>
            <p className="text-gray-600">Where artists thrive 🎨</p>
          </div>
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

      <div className="max-w-7xl mx-auto px-4 py-8 flex gap-6">
        
        {/* Sidebar - Communities */}
        <aside className={`${sidebarOpen ? 'w-64' : 'w-12'} transition-all duration-300 flex-shrink-0`}>
          <div className="bg-white rounded-lg shadow-lg p-4 sticky top-4">
            
            {/* Collapse Button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex items-center justify-between w-full mb-4 text-gray-700 hover:text-pink-500"
            >
              {sidebarOpen ? (
                <>
                  <span className="font-bold text-sm">📚 COMMUNITIES</span>
                  <span>▼</span>
                </>
              ) : (
                <div className="flex justify-center w-full">
                  <span className="text-2xl">▶</span>
                </div>
              )}
            </button>

            {/* Communities List */}
            {sidebarOpen && (
              <div className="space-y-2">
                {communities.map((community) => (
                  <Link 
                    key={community.id}
                    href={`/n/${community.name}`}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-pink-50 transition"
                  >
                    <span className="text-xl">{communityIcons[community.name] || '🎨'}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">/n/{community.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content - Gallery */}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Artworks</h2>

          {loading ? (
            <p className="text-gray-600">Loading artworks...</p>
          ) : artworks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg mb-4">No artworks yet!</p>
              <Link 
                href="/upload"
                className="text-pink-500 font-medium hover:underline"
              >
                Be the first to upload →
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
  by{' '}
  <Link 
    href={`/profile/${artwork.profiles?.username}`}
    className="text-pink-500 hover:underline"
    onClick={(e) => e.stopPropagation()}
  >
    {artwork.profiles?.username || 'Unknown'}
  </Link>
</p>
                      {artwork.description && (
                        <p className="text-sm text-gray-700 line-clamp-2">
                          {artwork.description}
                        </p>
                      )}
                      
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
      </div>
    </main>
  )
}