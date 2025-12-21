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
                    HOW WE'RE BUILDING THIS GAME
                </h1>

                <div style={{
                    fontSize: '14px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    textAlign: 'center',
                    marginBottom: '60px',
                }}>
                    A commitment to transparency • Last updated: December 2024
                </div>

                {/* ============================================ */}
                {/* SECTION 1: PHILOSOPHY FIRST - Establish shared values */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🔥 THE CAMPFIRE AT THE END OF TIME
                    </h2>
                    
                    <div style={{
                        backgroundColor: 'rgba(255, 140, 0, 0.15)',
                        border: '1px solid rgba(255, 140, 0, 0.4)',
                        borderRadius: '8px',
                        padding: '28px',
                        marginBottom: '24px',
                    }}>
                        <p style={{
                            fontSize: '18px',
                            color: 'rgba(255, 255, 255, 0.95)',
                            margin: 0,
                            lineHeight: '1.9',
                            fontStyle: 'italic',
                        }}>
                            "In a world where machines can paint and compose, what remains uniquely human? <strong style={{ color: '#ff8c00' }}>Storytelling.</strong> The raw, authentic narratives that emerge from lived experience, from joy and suffering, from the depths of the soul. These cannot be fabricated. They can only be told."
                        </p>
                    </div>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        We believe storytelling may be <strong>the last truly human profession</strong>. Not because AI can't generate words or images that look like stories — it clearly can. But because authentic stories come from somewhere AI cannot reach: the lived human experience, our collective memory, our hopes and fears, our cultural heritage passed down through generations.
                    </p>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        Games are one of humanity's most powerful storytelling mediums. They combine <strong>visual art, sound, music, and narrative</strong> — the primary drivers of emotional connection — into interactive experiences that stay with us forever. These elements deserve to be crafted by human hands and hearts.
                    </p>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        We see AI as a <strong>prototyping tool</strong> — a way to sketch the outline of what we want to build. But the soul of the game, its stories, its art, its music. These must ultimately flow from human creativity. AI can assist in the scaffolding, but <em>stories come from the soul</em>.
                    </p>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        lineHeight: '1.8',
                    }}>
                        We invite you to gather around this campfire at the end of time with us. To share in the telling of true, authentic human stories. That's what games should be. <strong>That's what we're building toward.</strong>
                    </p>
                </section>

                {/* ============================================ */}
                {/* SECTION 2: HUMAN INVESTMENT - Show proof we mean it */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🎨 WHERE WE'VE ALREADY INVESTED IN HUMAN ARTISTS
                    </h2>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '24px',
                        lineHeight: '1.8',
                    }}>
                        Actions speak louder than words. Here's where our limited budget has gone to <strong>real human creators</strong>:
                    </p>
                    
                    <div style={{
                        backgroundColor: 'rgba(0, 150, 0, 0.1)',
                        border: '1px solid rgba(0, 200, 0, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '16px',
                    }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                        }}>
                            <div>
                                <p style={{
                                    fontSize: '16px',
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    marginBottom: '16px',
                                }}>
                                    <strong style={{ color: '#4ade80' }}>Character Sprite Sheets</strong> — Our player character animations were created by talented human pixel artists. This includes all walking, running, idle, dodge rolling and swimming animations for the babushka characters.
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
                            
                            {/* Proof of Order */}
                            <div style={{
                                marginTop: '12px',
                                padding: '12px',
                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '6px',
                            }}>
                                <p style={{
                                    fontSize: '12px',
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    marginBottom: '8px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                }}>
                                    📄 Proof of Commission
                                </p>
                                <img 
                                    src="/images/blog/order_details.png" 
                                    alt="Fiverr order details showing commission of character sprite sheets from human artist"
                                    style={{
                                        width: '100%',
                                        maxWidth: '500px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(255, 255, 255, 0.2)',
                                    }}
                                />
                            </div>
                        </div>
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

                    <div style={{
                        backgroundColor: 'rgba(0, 150, 0, 0.15)',
                        border: '2px solid rgba(0, 200, 0, 0.4)',
                        borderRadius: '8px',
                        padding: '20px',
                        textAlign: 'center',
                    }}>
                        <p style={{
                            fontSize: '20px',
                            color: '#4ade80',
                            margin: 0,
                            fontWeight: 'bold',
                        }}>
                            Total Invested in Human Artists: $849.78
                        </p>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.6)',
                            margin: '8px 0 0 0',
                        }}>
                            And growing with every milestone
                        </p>
                    </div>
                </section>

                {/* ============================================ */}
                {/* SECTION 3: THE COMMITMENT - Our binding promise */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🎯 OUR BINDING COMMITMENT
                    </h2>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        Think of this project like <strong>Theseus' Ship</strong>: we've launched with some AI-assisted components because that's what was possible with zero funding. But plank by plank, pixel by pixel, note by note, our goal is to replace these with authentic human creations. The ship sails continuously, but its nature transforms as more human hands shape its destiny.
                    </p>
                    
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
                            <strong style={{ color: '#ff8c00' }}>The Promise:</strong> As Broth & Bullets generates revenue, we commit to <strong>reinvesting in human artists</strong>. Not just a portion — we're talking about systematically replacing AI-generated assets until the game is predominantly human-crafted. This isn't marketing speak. It's the whole point.
                        </p>
                    </div>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '16px',
                    }}>
                        <strong>Replacement Priority (in order):</strong>
                    </p>
                    
                    <ol style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        paddingLeft: '20px',
                        marginBottom: '20px',
                    }}>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>NPC Characters</strong> — Animals and wildlife deserve expressive, hand-animated sprites
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Item Icons</strong> — Every inventory item will get unique, hand-drawn icons
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Building Sprites</strong> — Detailed, cohesive architectural elements
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Music & Sound Effects</strong> — Original compositions and foley from human musicians and sound designers
                        </li>
                        <li style={{ marginBottom: '12px' }}>
                            <strong>Environment Tiles</strong> — Rich, varied terrain artwork
                        </li>
                    </ol>

                    <p style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        marginBottom: '20px',
                        fontStyle: 'italic',
                    }}>
                        Note: Sova, our in-game AI assistant, will remain AI-voiced by design — she's an AI character, and having her voiced by AI is the authentic choice.
                    </p>

                    <div style={{
                        backgroundColor: 'rgba(100, 200, 255, 0.1)',
                        border: '1px solid rgba(100, 200, 255, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '12px',
                            lineHeight: '1.8',
                        }}>
                            <strong style={{ color: '#60a5fa' }}>🚀 Coming Soon: Crowdfunding Campaign</strong>
                        </p>
                        <p style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            margin: 0,
                            lineHeight: '1.7',
                        }}>
                            We're actively working on a <strong>Kickstarter campaign</strong> and exploring other crowdsourcing options to accelerate the replacement of AI assets with human-created artwork, music, and sound design. If you believe in elevating human creativity, check back soon — or join our Discord to be notified when we launch.
                        </p>
                    </div>
                </section>

                {/* ============================================ */}
                {/* SECTION 4: ACKNOWLEDGMENT - Validate their concerns */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        🤝 WE HEAR YOU
                    </h2>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '20px',
                        lineHeight: '1.8',
                    }}>
                        Before we detail exactly what AI was used for, we want to acknowledge something important:
                    </p>

                    <div style={{
                        backgroundColor: 'rgba(255, 200, 100, 0.1)',
                        border: '1px solid rgba(255, 200, 100, 0.3)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.9)',
                            marginBottom: '16px',
                            lineHeight: '1.8',
                        }}>
                            <strong style={{ color: '#fcd34d' }}>The concerns about AI art are valid.</strong> Artists have spent years — often decades — honing their craft. Many are watching their livelihoods threatened by technology trained on their work, often without consent or compensation. That's not fair, and we don't pretend otherwise.
                        </p>
                        <p style={{
                            fontSize: '16px',
                            color: 'rgba(255, 255, 255, 0.85)',
                            margin: 0,
                            lineHeight: '1.8',
                        }}>
                            We're not here to argue that AI art is equivalent to human art. <strong>It isn't.</strong> We're here to be honest about what we used, why we used it, and how we plan to move past it.
                        </p>
                    </div>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        lineHeight: '1.8',
                    }}>
                        This game was built by a solo developer with no funding and a vision that would otherwise be impossible to realize. The choice wasn't "AI or human artists" — it was "AI or nothing exists at all." We chose to build something imperfect that could grow, rather than wait forever for perfect conditions that might never come.
                    </p>
                </section>

                {/* ============================================ */}
                {/* SECTION 5: THE HONEST DISCLOSURE - Now they're ready */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        📋 COMPLETE AI DISCLOSURE
                    </h2>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '24px',
                        lineHeight: '1.8',
                    }}>
                        In the spirit of full transparency, here's exactly what AI tools were used in development. Nothing hidden, nothing glossed over.
                    </p>

                    {/* AI Art */}
                    <div style={{
                        backgroundColor: 'rgba(255, 100, 100, 0.08)',
                        border: '1px solid rgba(255, 100, 100, 0.25)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <h3 style={{
                            fontSize: '18px',
                            color: '#fca5a5',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                        }}>
                            🖼️ AI-Generated Artwork
                        </h3>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            marginBottom: '16px',
                        }}>
                            Tool: <a href="https://retrodiffusion.com" target="_blank" rel="noopener noreferrer" style={{ color: '#ff8c00', textDecoration: 'none' }}>RetroDiffusion.com</a> (specialized pixel art AI)
                        </p>
                        <ul style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.75)',
                            paddingLeft: '20px',
                            margin: 0,
                        }}>
                            <li style={{ marginBottom: '8px' }}>Environment Tiles — Ground textures, terrain, water tiles</li>
                            <li style={{ marginBottom: '8px' }}>Item Icons — Inventory icons for tools, weapons, food</li>
                            <li style={{ marginBottom: '8px' }}>Building Sprites — Structures, walls, furniture</li>
                            <li style={{ marginBottom: '8px' }}>NPC Sprites — Animals and wildlife</li>
                            <li style={{ marginBottom: '8px' }}>Effect Animations — Particles, visual feedback</li>
                            <li style={{ marginBottom: '0' }}>Marketing Materials — Website backgrounds, promo images</li>
                        </ul>
                    </div>

                    {/* AI Audio - To Be Replaced */}
                    <div style={{
                        backgroundColor: 'rgba(255, 100, 100, 0.08)',
                        border: '1px solid rgba(255, 100, 100, 0.25)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <h3 style={{
                            fontSize: '18px',
                            color: '#fca5a5',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                        }}>
                            🎵 AI Audio (Targeted for Replacement)
                        </h3>
                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            marginBottom: '16px',
                        }}>
                            These audio elements we plan to replace with human-created content:
                        </p>
                        <ul style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.75)',
                            paddingLeft: '20px',
                            margin: 0,
                        }}>
                            <li style={{ marginBottom: '8px' }}>
                                <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" style={{ color: '#ff8c00', textDecoration: 'none' }}>ElevenLabs</a> — Sound effects, UI sounds, ambient voice elements
                            </li>
                            <li style={{ marginBottom: '0' }}>
                                <a href="https://suno.ai" target="_blank" rel="noopener noreferrer" style={{ color: '#ff8c00', textDecoration: 'none' }}>Suno.ai</a> — Background music and ambient soundtracks
                            </li>
                        </ul>
                    </div>

                    {/* Sova AI - Intentionally AI */}
                    <div style={{
                        backgroundColor: 'rgba(100, 200, 255, 0.08)',
                        border: '1px solid rgba(100, 200, 255, 0.25)',
                        borderRadius: '8px',
                        padding: '24px',
                        marginBottom: '20px',
                    }}>
                        <h3 style={{
                            fontSize: '18px',
                            color: '#60a5fa',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                        }}>
                            🤖 Sova AI Assistant (Intentionally AI-Voiced)
                        </h3>
                        <div style={{
                            backgroundColor: 'rgba(100, 200, 255, 0.1)',
                            borderRadius: '6px',
                            padding: '16px',
                            marginBottom: '16px',
                        }}>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.85)',
                                margin: 0,
                                lineHeight: '1.7',
                                fontStyle: 'italic',
                            }}>
                                <strong style={{ color: '#60a5fa' }}>Design Decision:</strong> Sova is an AI character within the game world. Having her voiced by AI technology is a <em>diegetic choice</em> — it would feel inauthentic to have a human pretend to be an AI. The synthetic quality of her voice is intentional and thematically appropriate.
                            </p>
                        </div>
                        <ul style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.75)',
                            paddingLeft: '20px',
                            margin: 0,
                        }}>
                            <li style={{ marginBottom: '8px' }}>
                                <strong>Kokoro TTS</strong> (Open Source) — Powers Sova's real-time voice responses
                            </li>
                            <li style={{ marginBottom: '0' }}>
                                AI Language Models — Sova's conversational understanding and responses
                            </li>
                        </ul>
                        <p style={{
                            fontSize: '13px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginTop: '16px',
                            marginBottom: 0,
                            fontStyle: 'italic',
                        }}>
                            This is not a compromise — it's the authentic representation of an AI character.
                        </p>
                    </div>

                    {/* AI Code - But Also Open Source */}
                    <div style={{
                        backgroundColor: 'rgba(100, 200, 100, 0.08)',
                        border: '1px solid rgba(100, 200, 100, 0.25)',
                        borderRadius: '8px',
                        padding: '24px',
                    }}>
                        <h3 style={{
                            fontSize: '18px',
                            color: '#4ade80',
                            marginBottom: '16px',
                            fontWeight: 'bold',
                        }}>
                            💻 AI in Code Development — And It's All Open Source
                        </h3>
                        
                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.15)',
                            borderRadius: '6px',
                            padding: '16px',
                            marginBottom: '20px',
                        }}>
                            <p style={{
                                fontSize: '15px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                margin: 0,
                                lineHeight: '1.7',
                            }}>
                                <strong style={{ color: '#4ade80' }}>Over a year of development.</strong> Yes, AI coding assistants helped but directing AI, debugging its mistakes, architecting systems, and iterating through hundreds of revisions still required <strong>thousands of hours</strong> of human time and decision-making.
                            </p>
                        </div>

                        <p style={{
                            fontSize: '14px',
                            color: 'rgba(255, 255, 255, 0.7)',
                            marginBottom: '16px',
                        }}>
                            AI assisted with:
                        </p>
                        <ul style={{
                            fontSize: '15px',
                            color: 'rgba(255, 255, 255, 0.75)',
                            paddingLeft: '20px',
                            marginBottom: '20px',
                        }}>
                            <li style={{ marginBottom: '8px' }}>Code Generation — Initial implementation of game systems</li>
                            <li style={{ marginBottom: '8px' }}>Bug Fixing — Identifying and resolving issues</li>
                            <li style={{ marginBottom: '8px' }}>Refactoring — Performance optimization</li>
                            <li style={{ marginBottom: '0' }}>Documentation — Technical docs and code comments</li>
                        </ul>

                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.2)',
                            border: '2px solid rgba(100, 200, 100, 0.4)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.95)',
                                marginBottom: '12px',
                                lineHeight: '1.7',
                            }}>
                                <strong style={{ color: '#4ade80' }}>🎁 Giving Back: 100% Open Source</strong>
                            </p>
                            <p style={{
                                fontSize: '15px',
                                color: 'rgba(255, 255, 255, 0.85)',
                                marginBottom: '16px',
                                lineHeight: '1.7',
                            }}>
                                The <strong>entire codebase</strong> — client, server, networking, all game systems — has been released under the <strong>MIT License</strong>. Over a year of work, given freely to the community.
                            </p>
                            <p style={{
                                fontSize: '15px',
                                color: 'rgba(255, 255, 255, 0.85)',
                                marginBottom: '16px',
                                lineHeight: '1.7',
                            }}>
                                We'd love for you to:
                            </p>
                            <ul style={{
                                fontSize: '15px',
                                color: 'rgba(255, 255, 255, 0.8)',
                                paddingLeft: '20px',
                                marginBottom: '16px',
                            }}>
                                <li style={{ marginBottom: '8px' }}>⭐ <strong>Contribute</strong> — Submit pull requests, fix bugs, add features</li>
                                <li style={{ marginBottom: '8px' }}>🔀 <strong>Fork it</strong> — Build your own survival game with our engine</li>
                                <li style={{ marginBottom: '8px' }}>🎮 <strong>Clone it</strong> — Learn from the architecture, use it in your projects</li>
                                <li style={{ marginBottom: '0' }}>🖥️ <strong>Host your own server</strong> — Run your own Broth & Bullets community</li>
                            </ul>
                            <a 
                                href="https://github.com/SeloSlav/2d-multiplayer-survival-mmorpg" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-block',
                                    backgroundColor: '#4ade80',
                                    color: '#000',
                                    padding: '12px 24px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    fontWeight: 'bold',
                                    fontSize: '15px',
                                }}
                            >
                                View on GitHub →
                            </a>
                        </div>
                    </div>
                </section>

                {/* ============================================ */}
                {/* SECTION 6: CALL TO ACTION - How to help */}
                {/* ============================================ */}
                <section style={{ marginBottom: '50px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        💖 HOW YOU CAN HELP
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.85)',
                        marginBottom: '24px',
                        lineHeight: '1.8',
                    }}>
                        If you share our vision of replacing AI-generated content with human creativity, here's how you can contribute to that mission:
                    </p>

                    <div style={{
                        display: 'grid',
                        gap: '16px',
                    }}>
                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.1)',
                            border: '1px solid rgba(100, 200, 100, 0.3)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                marginBottom: '8px',
                            }}>
                                <strong style={{ color: '#4ade80' }}>🎮 Play the Game</strong>
                            </p>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                margin: 0,
                            }}>
                                Revenue from the game directly funds human artist commissions. Every player contributes to the transformation.
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.1)',
                            border: '1px solid rgba(100, 200, 100, 0.3)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                marginBottom: '8px',
                            }}>
                                <strong style={{ color: '#4ade80' }}>🎨 Are You an Artist?</strong>
                            </p>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                margin: 0,
                            }}>
                                We're actively seeking talented pixel artists, musicians, and sound designers to commission. Contact us at{' '}
                                <a href="mailto:martin.erlic@gmail.com" style={{ color: '#ff8c00', textDecoration: 'none' }}>martin.erlic@gmail.com</a>
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.1)',
                            border: '1px solid rgba(100, 200, 100, 0.3)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                marginBottom: '8px',
                            }}>
                                <strong style={{ color: '#4ade80' }}>📢 Spread the Word</strong>
                            </p>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                margin: 0,
                            }}>
                                Share this page. Let people know there are developers trying to do this differently — building with AI as scaffolding, not as the final product.
                            </p>
                        </div>

                        <div style={{
                            backgroundColor: 'rgba(100, 200, 100, 0.1)',
                            border: '1px solid rgba(100, 200, 100, 0.3)',
                            borderRadius: '8px',
                            padding: '20px',
                        }}>
                            <p style={{
                                fontSize: '16px',
                                color: 'rgba(255, 255, 255, 0.9)',
                                marginBottom: '8px',
                            }}>
                                <strong style={{ color: '#4ade80' }}>⏳ Watch for Our Kickstarter</strong>
                            </p>
                            <p style={{
                                fontSize: '14px',
                                color: 'rgba(255, 255, 255, 0.7)',
                                margin: 0,
                            }}>
                                Our crowdfunding campaign will specifically fund human artist commissions. Join our community to be first to know when it launches.
                            </p>
                        </div>
                    </div>
                </section>

                {/* ============================================ */}
                {/* SECTION 7: QUESTIONS - Maintain openness */}
                {/* ============================================ */}
                <section style={{ marginBottom: '40px' }}>
                    <h2 style={{
                        fontSize: '24px',
                        color: '#ff8c00',
                        marginBottom: '20px',
                        fontWeight: 'bold',
                    }}>
                        ❓ QUESTIONS OR CONCERNS?
                    </h2>
                    
                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        marginBottom: '16px',
                        lineHeight: '1.8',
                    }}>
                        If you have questions about our AI usage, want to know more about specific assets, or have concerns you'd like to discuss — we're here. We're committed to transparency and genuinely want to hear from you.
                    </p>

                    <p style={{
                        fontSize: '16px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        lineHeight: '1.8',
                    }}>
                        Reach out anytime:{' '}
                        <a href="mailto:martin.erlic@gmail.com" style={{
                            color: '#ff8c00',
                            textDecoration: 'none',
                        }}>
                            martin.erlic@gmail.com
                        </a>
                    </p>
                </section>
            </div>

            <BlogFooter />
        </div>
    );
};

export default AIDisclosurePage;
