// Athena Frontend Configuration
// Configures the backend API URL with fallback to the hosted Render production service.

const DEFAULT_API_HOST = 'https://athena-api-ailq.onrender.com';

const configuredBase = import.meta.env?.VITE_API_URL || `${DEFAULT_API_HOST}/api`;

export const API_BASE_URL = configuredBase.replace(/\/+$/, '');

export const API_HOST_URL = API_BASE_URL.replace(/\/api$/, '');

export default {
  API_BASE_URL,
  API_HOST_URL,
};
