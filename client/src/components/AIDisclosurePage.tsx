import React from 'react';
import BlogHeader from '../common/BlogHeader';
import BlogFooter from '../blog/BlogFooter';

const AIDisclosurePage: React.FC = () => {
    return (
        <div style={{
            minHeight: '100vh',
            backgroundColor: '#0a0a0a',
            color: '#ffffff',
            fontFamily: "'Courier New', Consolas, Monaco, monospace",
            overflowX: 'hidden',
        }}>
            <BlogHeader />

            {/* Main Content */}
            <div style={{
                maxWidth: '800px',
                margin: '0 auto',
                padding: '140px 20px 60px 20px',
                lineHeight: '1.6',
            }}>
                <h1 style={{
                    fontSize: '48px',
                    color: '#ff8c00',
                    marginBottom: '20px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                }}>
                    AI DISCLOSURE
                </h1>

                <div style={{
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center',
                    marginBottom: '60px',
                }}>
                    Last updated: December 2024
                </div>

                {/* Transparency Statement */}
                <div style={{
                    backgroundColor: 'rgba(255, 140, 0, 0.1)',
                    border: '1px solid rgba(255, 140, 0, 0.3)',
                    borderRadius: '8px',
                    padding: '24px',
                    marginBottom: '40px',
                }}>
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.9)',
                        margin: 0,
                        lineHeight: '1.8',
                    }}>
                        <strong style={{ color: '#ff8c00' }}>Our Commitment to Transparency:</strong> Broth & Bullets was developed with significant assistance from AI tools. We believe players deserve to know how their games are made, so we're being upfront about our use of artificial intelligence in development.
                    </p>
                </div>

                {/* Human-Created Art Section */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🎨 HUMAN-CREATED ARTWORK
                    </h2>
                    
                    <div style={{
                        backgroundColor: 'rgba(0, 150, 0, 0.1)',
                        border: '1px solid rgba(0, 200, 0, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '16px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '16px',
                        }}>
                            <strong style={{ color: '#4ade80' }}>Character Sprite Sheets</strong> — Our player character animations were created by talented human pixel artists. This includes all walking, running, idle, combat, and interaction animations for the babushka characters.
                        </p>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            margin: 0,
                            fontStyle: 'italic',
                        }}>
                            Investment: $324.78
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: 'rgba(0, 150, 0, 0.1)',
                        border: '1px solid rgba(0, 200, 0, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '16px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '16px',
                        }}>
                            <strong style={{ color: '#4ade80' }}>Resource Sprites & Doodads</strong> — Trees, rocks, corals, seaweed, and ores were created by human pixel artists.
                        </p>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            margin: 0,
                            fontStyle: 'italic',
                        }}>
                            Investment: $450.00
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: 'rgba(0, 150, 0, 0.1)',
                        border: '1px solid rgba(0, 200, 0, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '16px',
                        }}>
                            <strong style={{ color: '#4ade80' }}>Game Logo</strong> — The Broth & Bullets logo was designed by a human graphic artist, capturing the game's unique blend of cozy survival and action gameplay.
                        </p>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            margin: 0,
                            fontStyle: 'italic',
                        }}>
                            Investment: $75.00
                        </p>
                    </div>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '20px',
                    }}>
                        These handcrafted assets represent our commitment to quality visual design. We prioritize commissioning human artists for the most visible and frequently seen elements of the game.
                    </p>
                </section>

                {/* AI-Generated Art Section */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🤖 AI-GENERATED ARTWORK
                    </h2>

                    <div style={{
                        backgroundColor: 'rgba(255, 100, 100, 0.1)',
                        border: '1px solid rgba(255, 100, 100, 0.3)',
                        borderRadius: '8px',
                        padding: '20px',
                        marginBottom: '20px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            margin: 0,
                        }}>
                            <strong style={{ color: '#fca5a5' }}>AI Art Tool:</strong> Most visual assets were generated using{' '}
                            <a href="https://retrodiffusion.com" target="_blank" rel="noopener noreferrer" style={{
                                color: '#ff8c00',
                                textDecoration: 'none',
                            }}>
                                RetroDiffusion.com
                            </a>
                            , a specialized AI tool for creating pixel art and retro-style game assets.
                        </p>
                    </div>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '20px',
                    }}>
                        The following visual assets were created with AI assistance:
                    </p>
                    
                    <ul style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        paddingLeft: '20px',
                        marginBottom: '20px',
                    }}>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Environment Tiles</strong> — Ground textures, terrain variations, water tiles, and landscape elements
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Item Icons</strong> — Inventory icons for tools, weapons, food, resources, and crafting materials
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Building Sprites</strong> — Structures, walls, doors, furniture, and crafting stations
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>NPC Sprites</strong> — Animals, wildlife, and non-player characters
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Effect Animations</strong> — Particles, spell effects, and visual feedback
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Marketing Materials</strong> — Website backgrounds, promotional images, and social media assets
                        </li>
                    </ul>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                    }}>
                        All AI-generated assets go through manual editing and refinement to ensure consistency and quality within the game's visual style.
                    </p>
                </section>

                {/* AI in Code Section */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        💻 AI IN CODE DEVELOPMENT
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '20px',
                    }}>
                        AI coding assistants were used extensively throughout development:
                    </p>
                    
                    <ul style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        paddingLeft: '20px',
                    }}>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Code Generation</strong> — Initial implementation of game systems, UI components, and server logic
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Bug Fixing</strong> — Identifying and resolving issues in both client and server code
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Refactoring</strong> — Improving code structure and performance optimization
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Documentation</strong> — Writing technical documentation and code comments
                        </li>
                    </ul>
                </section>

                {/* AI Voice Section */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🎤 AI VOICE & AUDIO
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '20px',
                    }}>
                        The in-game AI assistant "Sova" and audio elements use the following AI technologies:
                    </p>

                    <div style={{
                        backgroundColor: 'rgba(255, 100, 100, 0.1)',
                        border: '1px solid rgba(255, 100, 100, 0.3)',
                        borderRadius: '8px',
                        padding: '20px',
                        marginBottom: '16px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '8px',
                        }}>
                            <strong style={{ color: '#fca5a5' }}>
                                <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" style={{
                                    color: '#ff8c00',
                                    textDecoration: 'none',
                                }}>
                                    ElevenLabs.io
                                </a>
                            </strong>
                        </p>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            margin: 0,
                        }}>
                            Used for sound effects, loading screen audio, UI sounds, and ambient voice elements throughout the game.
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: 'rgba(255, 100, 100, 0.1)',
                        border: '1px solid rgba(255, 100, 100, 0.3)',
                        borderRadius: '8px',
                        padding: '20px',
                        marginBottom: '16px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '8px',
                        }}>
                            <strong style={{ color: '#fca5a5' }}>Kokoro TTS (Open Source)</strong>
                        </p>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            margin: 0,
                        }}>
                            Powers Sova's real-time voice responses during AI voice chat interactions. Kokoro is an open-source text-to-speech model that enables natural-sounding conversational AI.
                        </p>
                    </div>

                    <div style={{
                        backgroundColor: 'rgba(255, 100, 100, 0.1)',
                        border: '1px solid rgba(255, 100, 100, 0.3)',
                        borderRadius: '8px',
                        padding: '20px',
                        marginBottom: '20px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '8px',
                        }}>
                            <strong style={{ color: '#fca5a5' }}>
                                <a href="https://suno.ai" target="_blank" rel="noopener noreferrer" style={{
                                    color: '#ff8c00',
                                    textDecoration: 'none',
                                }}>
                                    Suno.ai
                                </a>
                            </strong>
                        </p>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            margin: 0,
                        }}>
                            All background music and ambient soundtracks in the game were generated using Suno.ai's AI music composition platform.
                        </p>
                    </div>
                    
                    <ul style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        paddingLeft: '20px',
                    }}>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>AI Language Model</strong> — Natural language processing for understanding player questions and generating helpful responses
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Speech Recognition</strong> — AI-powered voice-to-text for player voice commands
                        </li>
                    </ul>
                </section>

                {/* Our Roadmap Section */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🎯 OUR COMMITMENT TO HUMAN ARTISTS
                    </h2>
                    
                    <div style={{
                        backgroundColor: 'rgba(255, 140, 0, 0.1)',
                        border: '1px solid rgba(255, 140, 0, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            margin: 0,
                            lineHeight: '1.8',
                        }}>
                            <strong style={{ color: '#ff8c00' }}>Our Goal:</strong> As Broth & Bullets generates revenue, we are committed to gradually replacing AI-generated assets with human-created artwork. We believe in supporting the artist community and want our game to eventually feature predominantly handcrafted visuals.
                        </p>
                    </div>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '20px',
                    }}>
                        <strong>Replacement Priority:</strong>
                    </p>
                    
                    <ol style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        paddingLeft: '20px',
                    }}>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>NPC Characters</strong> — Animals and wildlife sprites for more expressive animations
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Item Icons</strong> — Unique, hand-drawn icons for all inventory items
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Building Sprites</strong> — Detailed, cohesive architectural elements
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Environment Tiles</strong> — Rich, varied terrain and landscape artwork
                        </li>
                    </ol>
                </section>

                {/* Why We Use AI Section */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🤔 WHY WE USE AI
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '20px',
                    }}>
                        Broth & Bullets is developed by a solo developer with limited resources. AI tools have made it possible to:
                    </p>
                    
                    <ul style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        paddingLeft: '20px',
                    }}>
                        <li style={{ marginBottom: '12px' }}>
                            Rapidly prototype and iterate on game ideas
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            Create a playable game that would otherwise be impossible for a solo developer
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            Focus limited budget on the most important human-created assets (player characters)
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            Ship an early access version while building toward a higher-quality final product
                        </li>
                    </ul>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginTop: '20px',
                    }}>
                        We view AI as a bootstrapping tool — a way to get the game into players' hands while we work toward our vision of a fully human-crafted experience.
                    </p>
                </section>

                {/* Support Human Artists */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        💖 SUPPORT HUMAN ARTISTS
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '20px',
                    }}>
                        If you're a pixel artist interested in contributing to Broth & Bullets, we'd love to hear from you! We're actively seeking talented artists to commission as funding allows.
                    </p>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                    }}>
                        Contact us at:{' '}
                        <a href="mailto:martin.erlic@gmail.com" style={{
                            color: '#ff8c00',
                            textDecoration: 'none',
                        }}>
                            martin.erlic@gmail.com
                        </a>
                    </p>
                </section>

                {/* Questions Section */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        ❓ QUESTIONS?
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                    }}>
                        If you have questions about our AI usage or want to know more about specific assets, feel free to reach out. We're committed to transparency and happy to discuss our development process.
                    </p>
                </section>
            </div>

            <BlogFooter />
        </div>
    );
};

export default AIDisclosurePage;
