import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faTimes } from '@fortawesome/free-solid-svg-icons';

const BlogHeader: React.FC = () => {
    const navigate = useNavigate();
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 768);
            if (window.innerWidth > 768) {
                setIsMenuOpen(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    
    const handleNavigate = (path: string) => {
        navigate(path);
        window.scrollTo(0, 0);
        setIsMenuOpen(false);
    };
    
    return (
        <>
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `}</style>
            <header style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                width: '100%',
                zIndex: 1000,
                background: 'linear-gradient(135deg, rgba(0, 10, 20, 0.95) 0%, rgba(0, 20, 40, 0.98) 100%)',
                backdropFilter: 'blur(10px)',
                borderBottom: '1px solid rgba(0, 170, 255, 0.3)',
                boxShadow: '0 2px 10px rgba(0, 170, 255, 0.2)',
                padding: isMobile ? '10px 0' : '15px 0',
                height: isMobile ? '60px' : '80px',
                boxSizing: 'border-box',
            }}>
                <div style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    padding: isMobile ? '0 15px' : '0 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: '100%',
                }}>
                    {/* Logo */}
                    <div 
                        onClick={() => handleNavigate('/')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            textDecoration: 'none',
                            transition: 'all 0.3s ease',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        <img
                            src="/images/blog/logo_alt.png"
                            alt="Broth & Bullets"
                            style={{
                                height: isMobile ? '40px' : '50px',
                                width: 'auto',
                                filter: 'none',
                                boxShadow: 'none',
                                border: 'none',
                                outline: 'none',
                            }}
                        />
                    </div>

                    {/* Desktop buttons or Mobile hamburger */}
                    {isMobile ? (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                        }}>
                            {/* Play Now Button */}
                            <button
                                onClick={() => handleNavigate('/')}
                                style={{
                                    display: 'inline-block',
                                    background: 'linear-gradient(135deg, #003366 0%, #00aaff 100%)',
                                    border: '2px solid #00aaff',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    padding: '10px 18px',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    letterSpacing: '1px',
                                    textTransform: 'uppercase',
                                    textDecoration: 'none',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 10px rgba(0, 170, 255, 0.3)',
                                    fontFamily: "'Courier New', Consolas, Monaco, monospace",
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, #0066aa 0%, #00ddff 100%)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 170, 255, 0.6)';
                                    e.currentTarget.style.borderColor = '#00ddff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, #003366 0%, #00aaff 100%)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 170, 255, 0.3)';
                                    e.currentTarget.style.borderColor = '#00aaff';
                                }}
                            >
                                Play Now
                            </button>
                            {/* Hamburger Menu */}
                            <button
                                onClick={() => setIsMenuOpen(!isMenuOpen)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    fontSize: '24px',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = '#00ddff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                                }}
                            >
                                <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars} />
                            </button>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                        }}>
                            {/* Back to Blog Button */}
                            <button
                                onClick={() => handleNavigate('/blog')}
                                style={{
                                    display: 'inline-block',
                                    background: 'linear-gradient(135deg, #2a2a2a 0%, #404040 100%)',
                                    border: '2px solid #666666',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    padding: '12px 24px',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    letterSpacing: '1px',
                                    textTransform: 'uppercase',
                                    textDecoration: 'none',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 10px rgba(102, 102, 102, 0.3)',
                                    fontFamily: "'Courier New', Consolas, Monaco, monospace",
                                    minWidth: '120px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, #404040 0%, #606060 100%)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(102, 102, 102, 0.6)';
                                    e.currentTarget.style.borderColor = '#888888';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #404040 100%)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 0 10px rgba(102, 102, 102, 0.3)';
                                    e.currentTarget.style.borderColor = '#666666';
                                }}
                            >
                                Blog
                            </button>

                            {/* Play Now Button */}
                            <button
                                onClick={() => handleNavigate('/')}
                                style={{
                                    display: 'inline-block',
                                    background: 'linear-gradient(135deg, #003366 0%, #00aaff 100%)',
                                    border: '2px solid #00aaff',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    padding: '12px 24px',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    letterSpacing: '1px',
                                    textTransform: 'uppercase',
                                    textDecoration: 'none',
                                    transition: 'all 0.3s ease',
                                    boxShadow: '0 0 10px rgba(0, 170, 255, 0.3)',
                                    fontFamily: "'Courier New', Consolas, Monaco, monospace",
                                    minWidth: '120px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, #0066aa 0%, #00ddff 100%)';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 170, 255, 0.6)';
                                    e.currentTarget.style.borderColor = '#00ddff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, #003366 0%, #00aaff 100%)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 170, 255, 0.3)';
                                    e.currentTarget.style.borderColor = '#00aaff';
                                }}
                            >
                                Play Now
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            {isMobile && isMenuOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        onClick={() => setIsMenuOpen(false)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            zIndex: 999,
                            animation: 'fadeIn 0.2s ease-out',
                        }}
                    />
                    
                    {/* Menu Panel */}
                    <div
                        style={{
                            position: 'fixed',
                            top: '60px',
                            right: 0,
                            width: '280px',
                            maxWidth: '85vw',
                            height: 'calc(100vh - 60px)',
                            backgroundColor: 'rgba(0, 0, 0, 0.98)',
                            backdropFilter: 'blur(20px)',
                            borderLeft: '2px solid rgba(0, 170, 255, 0.3)',
                            boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.5)',
                            zIndex: 1000,
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '20px 0',
                            animation: 'slideInRight 0.3s ease-out',
                            overflowY: 'auto',
                        }}
                    >
                        <button
                            onClick={() => handleNavigate('/blog')}
                            style={{
                                background: 'linear-gradient(135deg, #2a2a2a 0%, #404040 100%)',
                                border: '2px solid #666666',
                                borderRadius: '8px',
                                color: '#ffffff',
                                padding: '14px 20px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                letterSpacing: '1px',
                                textTransform: 'uppercase',
                                margin: '0 20px 16px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                fontFamily: "'Courier New', Consolas, Monaco, monospace",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, #404040 0%, #606060 100%)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.borderColor = '#888888';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, #2a2a2a 0%, #404040 100%)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.borderColor = '#666666';
                            }}
                        >
                            Blog
                        </button>

                        <button
                            onClick={() => handleNavigate('/')}
                            style={{
                                background: 'linear-gradient(135deg, #003366 0%, #00aaff 100%)',
                                border: '2px solid #00aaff',
                                borderRadius: '8px',
                                color: '#ffffff',
                                padding: '14px 20px',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                letterSpacing: '1px',
                                textTransform: 'uppercase',
                                margin: '0 20px',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                fontFamily: "'Courier New', Consolas, Monaco, monospace",
                                boxShadow: '0 0 10px rgba(0, 170, 255, 0.3)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, #0066aa 0%, #00ddff 100%)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 170, 255, 0.6)';
                                e.currentTarget.style.borderColor = '#00ddff';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'linear-gradient(135deg, #003366 0%, #00aaff 100%)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 170, 255, 0.3)';
                                e.currentTarget.style.borderColor = '#00aaff';
                            }}
                        >
                            Play Now
                        </button>
                    </div>
                </>
            )}
        </>
    );
};

export default BlogHeader; 