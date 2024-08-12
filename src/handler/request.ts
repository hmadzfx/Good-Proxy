import { HonoRequest } from "hono";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "3600",
};

export async function RequestHandler({ response }: { response: HonoRequest }) {
  try {
    const { url, ref } = response.query();
    const userHeaders = response.header();

    const urlified = new URL(url);
    console.log(url);

    // fetching content from the remote server using the headers provided by the user
    const fetchedResponse = await fetch(url, {
      headers: { ...userHeaders, ...corsHeaders, Referer: ref ? ref : "" },
    }); // making request

    const type = fetchedResponse.headers.get("Content-Type") || "text/plain"; // detecting type of the response
    let responseBody: BodyInit | null = fetchedResponse.body;
    console.log(type);

    // THIS LITERALLY TOOK 5 HOURS
    if (type.includes("text/vtt")) {
      console.log("VTT file found");
      responseBody = (await fetchedResponse.text()) as string;

      const regex = /.+?\.(jpg)+/g;
      const matches = [...responseBody.matchAll(regex)];

      let fileNames: string[] = [];
      // Iterate over matches
      for (const match of matches) {
        const filename = match[0];
        if (!fileNames.includes(filename)) {
          fileNames.push(filename);
        }
      }

      if (fileNames.length > 0) {
        for (const filename of fileNames) {
          const newUrl = url.replace(/\/[^\/]*$/, `/${filename}`);
          responseBody = responseBody.replaceAll(
            filename,
            "/fetch?url=" + newUrl
          );
        }
      }
    } else if (
      type.includes("application/vnd.apple.mpegurl") ||
      type.includes("video/MP2T") ||
      type.includes("text/html")
    ) {
      responseBody = (await fetchedResponse.text()) as string;
      if (!responseBody.startsWith("#EXTM3U")) {
        console.log("error logger");
        return new Response(responseBody, {
          headers: corsHeaders,
          status: fetchedResponse.status,
          statusText: fetchedResponse.statusText,
        });
      }
      console.log("HLS stream found");

      // Regular expression to match the last segment of the URL
      const regex = /\/[^\/]*$/;
      const urlRegex = /^(?:(?:(?:https?|ftp):)?\/\/)[^\s/$.?#].[^\s]*$/i;
      const m3u8FileChunks = responseBody.split("\n");
      const m3u8AdjustedChunks = [];

      for (const line of m3u8FileChunks) {
        if (line.startsWith("#") || !line.trim()) {
          m3u8AdjustedChunks.push(line);
          continue;
        }

        let formattedLine = line;
        if (line.startsWith(".")) {
          formattedLine = line.substring(1); // Remove the leading dot
        }

        if (formattedLine.match(urlRegex)) {
          console.log("TS or M3U8 files with URLs found, adding proxy path");
          m3u8AdjustedChunks.push(
            `/fetch?url=${encodeURIComponent(formattedLine)}`
          );
        } else {
          const newUrls = url.replace(
            regex,
            formattedLine.startsWith("/") ? formattedLine : `/${formattedLine}`
          );
          console.log(
            "TS or M3U8 files with no URLs found, adding path and proxy path."
          );
          m3u8AdjustedChunks.push(`/fetch?url=${encodeURIComponent(newUrls)}`);
        }
        // Update URL according to your needs
      }
      responseBody = m3u8AdjustedChunks.join("\n");
    }

    corsHeaders["Content-Type"] = type;

    return new Response(responseBody, {
      headers: corsHeaders,
      status: fetchedResponse.status,
      statusText: fetchedResponse.statusText,
    });
  } catch (error: any) {
    console.error(error);

    return new Response(
      JSON.stringify({ message: "Request failed", error: error.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json", // Set content type to JSON
        },
      }
    );
  }
}

export function getUrl(input: string, fallbackUrl: string): URL {
  try {
    return new URL(input);
  } catch (e) {
    return new URL(input, fallbackUrl);
  }
}
