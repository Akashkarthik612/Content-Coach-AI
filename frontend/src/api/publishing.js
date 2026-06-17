// Publishing / scheduling integrations — NOT live yet.
//
// Both functions below are intentionally isolated in this one file so the real
// LinkedIn / X / Reddit integration has a single, obvious place to be wired in
// later. Nothing here touches the backend; everything resolves locally so the
// editor's UI/UX can be fully exercised today.

/**
 * Send a post into the review queue.
 * // TODO: connect PATCH /posts/{id}/review → review queue (backend has no
 * `in_review` status / endpoint yet — see backend/vault/models.py PostStatus).
 */
export function sendToReview(post) {
  return new Promise(resolve => {
    setTimeout(() => resolve({ ok: true, post_id: post.id, status: 'in_review' }), 250);
  });
}

/**
 * Publish or schedule a post to one or more platforms.
 * // TODO: connect real LinkedIn / X / Reddit publishing & scheduling APIs here.
 * Until then this just resolves optimistically so the Schedule/Publish sheet's
 * UI can be exercised end-to-end.
 */
export function publishPost({ postId, platforms, scheduledAt }) {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        ok: true,
        post_id: postId,
        platforms,
        status: scheduledAt ? 'scheduled' : 'published',
        scheduled_at: scheduledAt ?? null,
      });
    }, 400);
  });
}
