const Pusher = require('pusher');

exports.handler = async (event) => {
  // The user's name is sent from the client in the request body.
  // The body needs to be parsed from the event.
  const params = new URLSearchParams(event.body);
  const socket_id = params.get('socket_id');
  const channel_name = params.get('channel_name');
  
  // We also pass the playerName in the auth request from the client
  const playerName = params.get('playerName') || 'A new player';

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
          playerName: playerName 
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
