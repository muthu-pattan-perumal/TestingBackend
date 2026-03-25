const getApiBaseUrl = () => {
    // If we're on localhost, use the local server
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:5000';
    }
    // Otherwise use the Render backend
    return 'https://testingbackend-xia0.onrender.com';
};

const config = {
    API_BASE_URL: getApiBaseUrl()
};

export default config;
