
// services/artwork/routes/generateArtwork.js
import { createPodcastArtwork } from "../createPodcastArtwork.js";

export async function generateArtwork(sessionId, prompt){
  return await createPodcastArtwork({ sessionId, prompt });
}
export default generateArtwork;
