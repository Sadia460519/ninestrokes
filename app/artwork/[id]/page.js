'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/app/components/Header'

export default function ArtworkDetailPage({ params: paramsPromise }) {
  const params = React.use(paramsPromise)
  const [artwork, setArtwork] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [user, setUser] = useState(null)
  const [hasStroked, setHasStroked] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchArtwork()
    fetchComments()
    checkUser()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    
    if (user) {
      // Check if user has already stroked this artwork
      const { data } = await supabase
        .from('strokes')
        .select('*')
        .eq('user_id', user.id)
        .eq('artwork_id', params.id)
        .single()
      
      setHasStroked(!!data)
    }
  }

  async function fetchArtwork() {
    const { data, error } = await supabase
      .from('artworks')
      .select(`
        *,
        profiles (username, avatar_url)
      `)
      .eq('id', params.id)
      .single()
    
    if (error) {
      console.error('Error:', error)
    } else {
      setArtwork(data)
    }
    setLoading(false)
  }

  async function fetchComments() {
    const { data, error } = await supabase
      .from('comments')
      .select(`
        *,
        profiles (username, avatar_url)
      `)
      .eq('artwork_id', params.id)
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error:', error)
    } else {
      setComments(data)
    }
  }

  async function handleStroke() {
    if (!user) {
      alert('Please login to give strokes!')
      router.push('/auth/login')
      return
    }

    if (hasStroked) {
      // Remove stroke
      await supabase
        .from('strokes')
        .delete()
        .eq('user_id', user.id)
        .eq('artwork_id', params.id)
      
      // Update count
      await supabase
        .from('artworks')
        .update({ stroke_count: artwork.stroke_count - 1 })
        .eq('id', params.id)
      
      setHasStroked(false)
      setArtwork({ ...artwork, stroke_count: artwork.stroke_count - 1 })
    } else {
      // Add stroke
      await supabase
        .from('strokes')
        .insert([{ user_id: user.id, artwork_id: params.id }])
      
      // Update count
      await supabase
        .from('artworks')
        .update({ stroke_count: artwork.stroke_count + 1 })
        .eq('id', params.id)
      
      setHasStroked(true)
      setArtwork({ ...artwork, stroke_count: artwork.stroke_count + 1 })
    }
  }

  async function handleCommentSubmit(e) {
    e.preventDefault()
    
    if (!user) {
      alert('Please login to comment!')
      router.push('/auth/login')
      return
    }

    if (!newComment.trim()) return

    const { data, error } = await supabase
      .from('comments')
      .insert([
        {
          user_id: user.id,
          artwork_id: params.id,
          content: newComment
        }
      ])
      .select(`
        *,
        profiles (username, avatar_url)
      `)

    if (error) {
      console.error('Error:', error)
    } else {
      setComments([data[0], ...comments])
      setNewComment('')
      
      // Update comment count
      await supabase
        .from('artworks')
        .update({ comment_count: artwork.comment_count + 1 })
        .eq('id', params.id)
      
      setArtwork({ ...artwork, comment_count: artwork.comment_count + 1 })
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-pink-50 p-8">
        <p>Loading...</p>
      </main>
    )
  }

  if (!artwork) {
    return (
      <main className="min-h-screen bg-pink-50 p-8">
        <p>Artwork not found!</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-pink-50">
      <Header />
<div className="max-w-7xl mx-auto px-4 py-4">
  <Link href="/" className="text-pink-500 hover:underline">
    ← Back to Gallery
  </Link>
</div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left: Artwork Image */}
          <div className="lg:col-span-2">
            <img 
              src={artwork.image_url} 
              alt={artwork.title}
              className="w-full rounded-lg shadow-lg"
            />
          </div>

          {/* Right: Details & Comments */}
          <div className="space-y-6">
            
            {/* Artwork Info */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {artwork.title}
              </h1>
              <p className="text-gray-600 mb-4">
  by{' '}
  <Link 
    href={`/profile/${artwork.profiles?.username}`}
    className="text-pink-500 hover:underline font-medium"
  >
    {artwork.profiles?.username || 'Unknown'}
  </Link>
</p>
              
              {artwork.description && (
                <p className="text-gray-700 mb-4">
                  {artwork.description}
                </p>
              )}

              {/* Stroke Button */}
              <button
                onClick={handleStroke}
                className={`w-full py-3 rounded-lg font-medium mb-2 ${
                  hasStroked 
                    ? 'bg-pink-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {hasStroked ? '❤️' : '🤍'} {artwork.stroke_count} Strokes
              </button>

              <div className="text-sm text-gray-500">
                💬 {artwork.comment_count} comments
              </div>
            </div>

            {/* Comments Section */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Comments</h2>

              {/* Add Comment Form */}
              <form onSubmit={handleCommentSubmit} className="mb-6">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="Write a comment..."
                  rows="3"
                />
                <button
                  type="submit"
                  className="mt-2 bg-pink-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-pink-600"
                >
                  Post Comment
                </button>
              </form>

              {/* Comments List */}
              <div className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-gray-500 text-sm">No comments yet. Be the first!</p>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="border-b pb-4">
                      <Link 
  href={`/profile/${comment.profiles?.username}`}
  className="font-medium text-gray-900 hover:text-pink-500"
>
  {comment.profiles?.username || 'Unknown'}
</Link>
                      <p className="text-gray-700 text-sm mt-1">
                        {comment.content}
                      </p>
                      <p className="text-gray-400 text-xs mt-1">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}