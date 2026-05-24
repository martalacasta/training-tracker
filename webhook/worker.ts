export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'GET') {
      const mode = url.searchParams.get('hub.mode')
      const challenge = url.searchParams.get('hub.challenge')
      const verifyToken = url.searchParams.get('hub.verify_token')
      const expectedToken = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN

      if (mode !== 'subscribe' || !challenge || !expectedToken || verifyToken !== expectedToken) {
        return new Response('Webhook verification failed', { status: 403 })
      }

      return Response.json({ 'hub.challenge': challenge })
    }

    if (request.method === 'POST') {
      const payload = (await request.json()) as {
        object_id?: number
        object_type?: string
        aspect_type?: string
      }

      if (!payload.object_id || payload.object_type !== 'activity') {
        return new Response('Ignored', { status: 202 })
      }

      // Replace with queue or durable persistence in your chosen platform.
      console.log('Strava event', payload.object_id, payload.aspect_type)
      return new Response('Accepted', { status: 202 })
    }

    return new Response('Method not allowed', { status: 405 })
  },
}
