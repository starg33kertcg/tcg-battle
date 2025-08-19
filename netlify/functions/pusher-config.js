exports.handler = async (event) => {
  // This function simply returns the public Pusher keys.
  // Make sure PUSHER_APP_KEY and PUSHER_CLUSTER are set in your Netlify dashboard.
  try {
    return {
      statusCode: 200,
      body: JSON.stringify({
        key: process.env.PUSHER_APP_KEY,
        cluster: process.env.PUSHER_CLUSTER,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Failed to load Pusher config' }),
    };
  }
};
