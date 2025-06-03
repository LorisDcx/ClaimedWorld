// @ts-ignore
// This should be a public test function 
// @public

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

console.log("Test webhook function initializing - ready to receive events");

// CORS headers for permissive access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log("Test webhook invoked! Method:", req.method);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Log headers for debugging - useful to see what Stripe is sending
  console.log("Request Headers:", Object.fromEntries(req.headers.entries()));

  try {
    const body = await req.text(); // Lire le corps en tant que texte
    console.log("Request body (first 500 chars):", body.substring(0, 500)); // Log only start of body if large
    
    let responseMessage = "Hello from test webhook! Received raw body.";
    try {
      // Tenter de parser en JSON si c'est du JSON, sinon juste retourner le texte
      const jsonBody = JSON.parse(body);
      console.log("Parsed JSON body:", jsonBody.type || "No 'type' field found");
      responseMessage = "Hello from test webhook! Received JSON.";
    } catch (jsonError) {
      console.log("Body is not JSON, or JSON parsing failed:", jsonError.message);
    }

    // Return success response
    return new Response(responseMessage, {
      headers: { 
        "Content-Type": "text/plain", 
        ...corsHeaders 
      },
      status: 200,
    });
  } catch (e) {
    console.error("Error in test webhook:", e);
    return new Response(`Error: ${e.message}`, { 
      headers: { 
        "Content-Type": "text/plain", 
        ...corsHeaders 
      },
      status: 500 
    });
  }
});
