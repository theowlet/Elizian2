import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/home.css';

const HomePage = () => {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="elizian-home-page">
      <div className="elizian-content-wrapper">
        <h1 className="elizian-home-title">Welcome to Elizian</h1>
        <p className="elizian-home-subtitle">Home Page - To be migrated from index.html</p>
        <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>User: {user.first_name || 'Guest'}</p>
        <button className="elizian-btn-primary" onClick={() => navigate('/')}>Back to Landing</button>
      </div>
    </div>
  );
};

export default HomePage;

