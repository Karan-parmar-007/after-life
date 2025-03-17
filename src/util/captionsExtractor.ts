export const extractCaptions = (type: string, key: string, audio_caption?: string, video_caption?: string, image_caption?: string) => {
      switch (true) {
            case type.includes("audio"):
                  return { key, caption: audio_caption }
            case type.includes("video"):
                  return { key, caption: video_caption }
            case type.includes("image"):
                  return { key, caption: image_caption }
            default:
                  break;
      }
}