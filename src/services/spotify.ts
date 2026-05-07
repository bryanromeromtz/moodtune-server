import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;

async function getSpotifyToken(): Promise<string> {
  const credentials = Buffer.from(
    `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      "grant_type=client_credentials",
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
    return response.data.access_token;
  } catch (error) {
    throw new Error(`Error obteniendo token de Spotify: ${error}`);
  }
}


export async function searchTracks(
  query: string,
  artist?: string
): Promise<any[]> {
  const token = await getSpotifyToken();

    let searchQuery = query;
    if (artist) {
    // buscamos por artista separado para no saturar la query
    searchQuery = `${artist} ${query.split(" ").slice(0, 2).join(" ")}`;
    }

  const response = await axios.get(
    "https://api.spotify.com/v1/search",
    {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        q: searchQuery,
        type: "track",
        limit: 10
      },
    }
  );

  return response.data.tracks.items.map((track: any) => ({
    id: track.id,
    name: track.name,
    artist: track.artists[0].name,
    album: track.album.name,
    preview_url: track.preview_url,
    spotify_url: track.external_urls.spotify,
    image: track.album.images[0]?.url,
  }));
}

