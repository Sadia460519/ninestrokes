'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CldUploadWidget } from 'next-cloudinary'


export default function UploadPage() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [communityId, setCommunityId] = useState('1')
  const [mode, setMode] = useState('gallery')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  
const router = useRouter()

useEffect(() => {
  checkAuth()
}, [])

async function checkAuth() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    router.push('/auth/login')
  }
}
  
  const handleUploadSuccess = (result) => {
    setImageUrl(result.info.secure_url)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!imageUrl) {
      setError('Please upload an image first!')
      return
    }

    setUploading(true)
    setError(null)

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setError('You must be logged in to upload!')
      setUploading(false)
      return
    }

    // Insert artwork into database
    const { data, error: uploadError } = await supabase
      .from('artworks')
      .insert([
        {
          user_id: user.id,
          community_id: parseInt(communityId),
          title: title,
          description: description,
          image_url: imageUrl,
          mode: mode,
        }
      ])
      .select()

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
    } else {
      // Success! Redirect to homepage
      router.push('/')
    }
  }

  return (
    <main className="min-h-screen bg-pink-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">
          Upload Artwork
        </h1>
        <p className="text-gray-600 mb-8">Share your art with the community 🎨</p>

        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-lg space-y-6">
          
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Artwork Image *
            </label>
            
            <CldUploadWidget
              uploadPreset="ninestrokes"
              onSuccess={handleUploadSuccess}
            >
              {({ open }) => (
                <div>
                  <button
                    type="button"
                    onClick={() => open()}
                    className="w-full border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-pink-500 transition"
                  >
                    {imageUrl ? (
                      <div>
                        <img src={imageUrl} alt="Preview" className="max-h-64 mx-auto mb-4 rounded" />
                        <p className="text-green-600 font-medium">✓ Image uploaded! Click to change</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-600 text-lg mb-2">📸 Click to upload image</p>
                        <p className="text-gray-400 text-sm">or drag and drop</p>
                      </div>
                    )}
                  </button>
                </div>
              )}
            </CldUploadWidget>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="Give your artwork a title"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="Tell us about your artwork..."
              rows="4"
            />
          </div>

          {/* Community Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Community *
            </label>
            <select
              value={communityId}
              onChange={(e) => setCommunityId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            >
              <option value="1">Watercolor</option>
              <option value="2">Digital Art</option>
              <option value="3">Photography</option>
              <option value="4">Sketches</option>
              <option value="5">Traditional Art</option>
              <option value="6">Abstract</option>
            </select>
          </div>

          {/* Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mode *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="gallery"
                  checked={mode === 'gallery'}
                  onChange={(e) => setMode(e.target.value)}
                  className="mr-2"
                />
                <span>Gallery (Finished work)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="sketch"
                  checked={mode === 'sketch'}
                  onChange={(e) => setMode(e.target.value)}
                  className="mr-2"
                />
                <span>Sketch (WIP)</span>
              </label>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-pink-500 text-white py-3 rounded-lg font-medium hover:bg-pink-600 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload Artwork'}
          </button>
        </form>
      </div>
    </main>
  )
}