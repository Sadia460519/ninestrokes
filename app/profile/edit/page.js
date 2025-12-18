'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/app/components/Header'
import { CldUploadWidget } from 'next-cloudinary'

export default function EditProfilePage() {
  const [profile, setProfile] = useState(null)
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  useEffect(() => {
    fetchProfile()
  }, [])

  async function fetchProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/auth/login')
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (error) {
      console.error('Error:', error)
    } else {
      setProfile(data)
      setBio(data.bio || '')
      setAvatarUrl(data.avatar_url || '')
    }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('profiles')
      .update({
        bio: bio,
        avatar_url: avatarUrl
      })
      .eq('id', user.id)
    
    if (error) {
      console.error('Error:', error)
      alert('Error saving profile')
    } else {
      // Redirect back to profile
      router.push(`/profile/${profile.username}`)
    }
    
    setSaving(false)
  }

  const handleAvatarUpload = (result) => {
    setAvatarUrl(result.info.secure_url)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-pink-50 p-8">
        <p>Loading...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-pink-50">
      <Header />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Edit Profile</h1>
          <Link 
            href={`/profile/${profile?.username}`}
            className="text-gray-600 hover:text-gray-900"
          >
            Cancel
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
          
          {/* Avatar Section */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Profile Picture
            </label>
            
            <div className="flex items-center gap-4">
              {/* Current Avatar */}
              <div className="w-24 h-24 bg-pink-200 rounded-full flex items-center justify-center text-4xl font-bold text-pink-600 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  profile?.username?.charAt(0).toUpperCase()
                )}
              </div>

              {/* Upload Button */}
              <CldUploadWidget
                uploadPreset="ninestrokes"
                onSuccess={handleAvatarUpload}
              >
                {({ open }) => (
                  <button
                    type="button"
                    onClick={() => open()}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
                  >
                    Change Avatar
                  </button>
                )}
              </CldUploadWidget>
            </div>
          </div>

          {/* Username (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={profile?.username || ''}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="Tell us about yourself..."
              rows="4"
              maxLength="200"
            />
            <p className="text-xs text-gray-500 mt-1">{bio.length}/200 characters</p>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-pink-500 text-white py-3 rounded-lg font-medium hover:bg-pink-600 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </main>
  )
}