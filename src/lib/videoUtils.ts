export const extractYouTubeId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

export const extractVimeoId = (url: string): string | null => {
  const regExp = /(?:www\.|player\.)?vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:[a-zA-Z0-9_\-]+)?/;
  const match = url.match(regExp);
  return match ? match[1] : null;
};

export const getVideoEmbedUrl = (
  platform: 'youtube' | 'vimeo',
  url: string
): string | null => {
  if (platform === 'youtube') {
    const videoId = extractYouTubeId(url);
    return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0` : null;
  } else {
    const videoId = extractVimeoId(url);
    return videoId
      ? `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0`
      : null;
  }
};
