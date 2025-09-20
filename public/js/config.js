// Define a URL base da API dependendo do ambiente
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000/api' // URL para desenvolvimento local
  : 'https://docevenenoestoque.onrender.com/api'; // URL para produção