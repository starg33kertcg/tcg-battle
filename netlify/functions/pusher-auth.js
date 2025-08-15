const Pusher = require('pusher');

exports.handler = async (event) => {
  // The user's info is sent from the client in the request body.
  const params = new URLSearchParams(event.body);
  const socket_id = params.get('socket_id');
  const channel_name = params.get('channel_name');
  const playerName = params.get('playerName') || 'A new player';
  // --- FIX: Get the isHost status from the client ---
  const isHost = params.get('isHost') === 'true';

  // IMPORTANT: You must set these as Environment Variables in your Netlify dashboard
  const pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_APP_KEY,
    secret: process.env.PUSHER_APP_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true,
  });

  // Presence channels require user info
  const user_id = `user_${socket_id}`; // Use socket_id for a unique user ID
  const presence_data = {
      user_id: user_id,
      user_info: {
          playerName: playerName,
          // --- FIX: Include isHost in the user's info for the presence channel ---
          isHost: isHost 
      }
  };

  try {
    const auth = pusher.authorizeChannel(socket_id, channel_name, presence_data);
    return {
      statusCode: 200,
      body: JSON.stringify(auth),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Pusher authentication failed' }),
    };
  }
};
