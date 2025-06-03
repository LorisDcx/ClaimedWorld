import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno'

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
    // Get request body
    const { countryId, amount, userId, successUrl, cancelUrl } = await req.json()

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get country details
    const { data: country, error: countryError } = await supabase
      .from('countries')
      .select('name, current_bid')
      .eq('id', countryId)
      .single()

    if (countryError) {
      throw new Error(`Error fetching country: ${countryError.message}`)
    }

    // Verify bid amount is valid
    const minBid = country.current_bid ? country.current_bid + 1 : 1
    if (amount < minBid) {
      throw new Error(`Bid amount must be at least ${minBid} €`)
    }

    // Get user details
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      throw new Error(`Error fetching user: ${userError.message}`)
    }

    // Initialize Stripe
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2022-11-15',
    })

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Enchère pour ${country.name}`,
              description: `Enchère de ${amount} € pour posséder virtuellement ${country.name}`,
            },
            unit_amount: amount * 100, // Stripe uses cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        countryId,
        userId,
        amount: amount.toString(),
      },
    })

    // Return the session ID
    return new Response(
      JSON.stringify({ sessionId: session.id }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 200,
      }
    )
  } catch (error) {
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
