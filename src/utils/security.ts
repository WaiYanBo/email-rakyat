/**
 * Security utility functions
 */

/**
 * Validates YouTube video ID format
 * YouTube video IDs are 11 characters long and contain alphanumeric characters, hyphens, and underscores
 * @param videoId - The video ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidYouTubeVideoId(videoId: string): boolean {
  if (!videoId || typeof videoId !== 'string') {
    return false;
  }
  
  // YouTube video IDs are exactly 11 characters
  // They contain: letters (a-z, A-Z), numbers (0-9), hyphens (-), and underscores (_)
  const youtubeIdPattern = /^[a-zA-Z0-9_-]{11}$/;
  return youtubeIdPattern.test(videoId);
}

/**
 * Sanitizes a video ID by extracting only valid characters
 * @param videoId - The video ID to sanitize
 * @returns Sanitized video ID or empty string if invalid
 */
export function sanitizeYouTubeVideoId(videoId: string): string {
  if (!videoId || typeof videoId !== 'string') {
    return '';
  }
  
  // Extract only valid characters
  const sanitized = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
  
  // Return only if it's exactly 11 characters (valid YouTube ID length)
  return sanitized.length === 11 ? sanitized : '';
}

/**
 * Validates and constructs a safe YouTube embed URL
 * @param videoId - The video ID
 * @param startTime - Optional start time in seconds
 * @returns Safe YouTube embed URL or empty string if invalid
 */
export function buildYouTubeEmbedUrl(videoId: string, startTime: number = 0): string {
  const validId = isValidYouTubeVideoId(videoId) ? videoId : sanitizeYouTubeVideoId(videoId);
  
  if (!validId) {
    return '';
  }
  
  // Ensure startTime is a non-negative integer
  const safeStartTime = Math.max(0, Math.floor(startTime));
  
  // Use youtube-nocookie.com for privacy
  return `https://www.youtube-nocookie.com/embed/${validId}?autoplay=1&start=${safeStartTime}&rel=0&modestbranding=1`;
}
