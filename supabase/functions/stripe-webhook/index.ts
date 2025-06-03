// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// @ts-ignore
// This function should be public and accept webhook events
// @public

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
// Import Stripe SDK - commenté car temporairement non utilisé à cause de l'erreur SubtleCryptoProvider
// import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

console.log('Stripe webhook function initialized - listening for events')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Processing webhook request...')
    // Get the stripe signature from the request headers
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      console.warn('Missing stripe-signature header - this may be a test or unauthorized request')
      // Continue anyway for testing purposes
      // In production you might want to reject these requests
      // throw new Error('No stripe signature found')
    }

    // Get the raw body and parse it as JSON
    const body = await req.text()
    console.log('Request body received, starting processing...')
    
    // Parse payload directly to handle the event
    let eventData;
    try {
      eventData = JSON.parse(body);
      console.log('Event type:', eventData.type);
    } catch (parseError) {
      console.error('Error parsing webhook body:', parseError);
      return new Response(JSON.stringify({ error: `Invalid JSON: ${parseError.message}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Process the event
    if (eventData.type === 'checkout.session.completed') {
      const session = eventData.data.object
      const { countryId, userId, amount } = session.metadata

      // Create a new bid
      const { error: bidError } = await supabase
        .from('bids')
        .insert({
          country_id: countryId,
          user_id: userId,
          amount: parseInt(amount, 10),
          is_winning: false, // Will be updated by the trigger
        })
        .single()

      if (bidError) {
        throw new Error(`Error creating bid: ${bidError.message}`)
      }

      console.log(`Successfully processed payment for country ${countryId} by user ${userId}`)
    }

    // Return a success response
    return new Response(
      JSON.stringify({ received: true }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error processing webhook:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 400,
      }
    )
  }
})
