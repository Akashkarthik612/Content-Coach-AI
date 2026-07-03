import { publishToLinkedIn } from './linkedin'

/**
 * Send a post into the review queue.
 * TODO: connect PATCH /posts/{id}/review — backend has no `in_review` status yet.
 */
export function sendToReview(post) {
  return new Promise(resolve => {
    setTimeout(() => resolve({ ok: true, post_id: post.id, status: 'in_review' }), 250)
  })
}

/**
 * Publish or schedule a post to one or more platforms.
 *
 * LinkedIn → calls real backend API (publishToLinkedIn).
 *   Returns the backend PublishResponse directly:
 *     {published, needs_auth, auth_url?, reason?, linkedin_post_id?}
 *   If needs_auth is true, the caller (DocEditor.handleConfirmPublish) must
 *   redirect window.location.href to result.auth_url.
 *
 * X / Reddit → still stubs (integrations deferred).
 */
export async function publishPost({ postId, platforms, scheduledAt }) {
  if (platforms.includes('linkedin') && !scheduledAt) {
    // Real LinkedIn publish — backend handles status update + publish log
    return publishToLinkedIn(postId)
  }

  // Stub for scheduled posts and non-LinkedIn platforms
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        ok: true,
        post_id: postId,
        platforms,
        status: scheduledAt ? 'scheduled' : 'published',
        scheduled_at: scheduledAt ?? null,
      })
    }, 400)
  })
}
