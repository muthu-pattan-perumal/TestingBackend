import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Save, Play, Plus, Trash2, ArrowLeft, Terminal, Layout, MoveUp, MoveDown, Settings, Code, CheckCircle, Clock, Activity } from 'lucide-react';
import config from '../config';

const TestBuilder = () => {
    const API_BASE_URL = config.API_BASE_URL;
    const { testId } = useParams();
    const navigate = useNavigate();
    const [test, setTest] = useState(null);
    const [steps, setSteps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    console.log(testId);
    useEffect(() => {
        // Fetch test steps
        fetch(`${API_BASE_URL}/api/tests/${testId}/steps`)
            .then(res => res.json())
            .then(data => {
                setSteps(data.map(s => ({ type: s.type, payload: JSON.parse(s.payload) })));
            });

        // Fetch test/project details
        fetch(`${API_BASE_URL}/api/tests/${testId}`)
            .then(res => res.json())
            .then(data => {
                setTest(data);
                setLoading(false);
            });
    }, [testId]);

    const addStep = (type) => {
        const newStep = {
            type,
            payload: type === 'API_REQUEST' ? { method: 'GET', url: '', headers: {}, body: '' } :
                type === 'CLICK' ? { selector: '', strategy: 'css', matchIndex: 1 } :
                    type === 'INPUT' ? { selector: '', value: '', strategy: 'css', matchIndex: 1 } :
                        type === 'WAIT_FOR' ? { selector: '', strategy: 'css', matchIndex: 1 } :
                            type === 'VALIDATE_STATUS' ? { expectedStatus: 200 } :
                                type === 'INTERCEPT_API' ? { urlPattern: '', expectedStatus: 200, method: 'ANY' } :
                                    { value: '' }
        };
        setSteps([...steps, newStep]);
    };

    const updateStep = (index, payload) => {
        const newSteps = [...steps];
        newSteps[index].payload = { ...newSteps[index].payload, ...payload };
        setSteps(newSteps);
    };

    const moveStep = (index, direction) => {
        if (direction === 'up' && index > 0) {
            const newSteps = [...steps];
            [newSteps[index], newSteps[index - 1]] = [newSteps[index - 1], newSteps[index]];
            setSteps(newSteps);
        } else if (direction === 'down' && index < steps.length - 1) {
            const newSteps = [...steps];
            [newSteps[index], newSteps[index + 1]] = [newSteps[index + 1], newSteps[index]];
            setSteps(newSteps);
        }
    };

    const removeStep = (index) => {
        setSteps(steps.filter((_, i) => i !== index));
    };

    const saveTest = () => {
        fetch(`${API_BASE_URL}/api/tests/${testId}/steps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steps })
        }).then(() => alert('Test saved successfully!'));
    };

    const publishTest = () => {
        fetch(`${API_BASE_URL}/api/tests/${testId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Published' })
        }).then(() => {
            setTest(prev => ({ ...prev, status: 'Published' }));
            alert('Test published successfully!');
        });
    };

    useEffect(() => {
        if (!running) return;

        let cancelled = false;
        let consecutiveErrors = 0;
        const MAX_ERRORS = 5;       // Stop polling after 5 back-to-back failures
        const BASE_INTERVAL = 200; // 200ms for ultra-speed near-real-time feed
        const MAX_INTERVAL = 5000; // cap at 5 s

        const poll = async () => {
            if (cancelled) return;

            try {
                const res = await fetch(`${API_BASE_URL}/api/tests/${testId}/run-status`, {
                    signal: AbortSignal.timeout(15000) // 15 s request timeout
                });

                if (!res.ok) {
                    // 520 or other server error — back off but keep trying
                    consecutiveErrors++;
                    console.warn(`Poll got ${res.status} (${consecutiveErrors}/${MAX_ERRORS})`);
                } else {
                    consecutiveErrors = 0; // reset on success
                    const data = await res.json();
                    if (data) {
                        if (data.finished) {
                            setRunning(false);
                            setResult(data);
                            return; // Stop polling
                        } else if (data.logs !== undefined || data.snapshots !== undefined || data.liveView !== undefined) {
                            // Only update if we have actual logs, snapshots or liveView
                            setResult(prev => ({
                                ...prev,
                                logs: data.logs ?? prev?.logs ?? '',
                                snapshots: data.snapshots ?? prev?.snapshots ?? [],
                                liveView: data.liveView ?? prev?.liveView,
                                isLive: true
                            }));
                        }
                    }
                }
            } catch (err) {
                consecutiveErrors++;
                console.error(`Poll error (${consecutiveErrors}/${MAX_ERRORS}):`, err.message);
            }

            if (consecutiveErrors >= MAX_ERRORS) {
                console.error('Too many poll failures — stopping. Check Render logs.');
                setRunning(false);
                setResult(prev => ({
                    ...prev,
                    logs: (prev?.logs || '') + '\n❌ Lost connection to server after multiple retries. Check Render dashboard.',
                    finished: true,
                    status: 'Failed'
                }));
                return;
            }

            // Exponential back-off: 4s, 8s, 12s… capped at 20s
            const delay = Math.min(BASE_INTERVAL * (consecutiveErrors + 1), MAX_INTERVAL);
            if (!cancelled) setTimeout(poll, delay);
        };

        // Start first poll after a short delay to let the server kick off the test
        const initialTimer = setTimeout(poll, BASE_INTERVAL);

        return () => {
            cancelled = true;
            clearTimeout(initialTimer);
        };
    }, [running, testId]);

    const runTest = () => {
        setRunning(true);
        setResult(null);
        fetch(`${API_BASE_URL}/api/tests/${testId}/run`, { method: 'POST' })
            .catch(err => {
                console.error("Run error:", err);
                setRunning(false);
            });
    };

    const actions = [
        {
            group: 'UI Actions', items: [
                { id: 'OPEN_URL', label: 'Open URL', icon: <Layout size={14} /> },
                { id: 'CLICK', label: 'Click Element', icon: <Layout size={14} /> },
                { id: 'INPUT', label: 'Enter Text', icon: <Layout size={14} /> },
                { id: 'WAIT_FOR', label: 'Wait for Element', icon: <Layout size={14} /> },
                { id: 'INTERCEPT_API', label: 'Intercept API', icon: <Activity size={14} /> },
                { id: 'SCREENSHOT', label: 'Take Screenshot', icon: <Layout size={14} /> }
            ]
        },
        {
            group: 'API Actions', items: [
                { id: 'GET', label: 'GET Request', icon: <Terminal size={14} /> },
                { id: 'POST', label: 'POST Request', icon: <Terminal size={14} /> },
                { id: 'VALIDATE_STATUS', label: 'Validate Status', icon: <CheckCircle size={14} /> },
                { id: 'VALIDATE_JSON', label: 'Validate JSON', icon: <CheckCircle size={14} /> }
            ]
        }
    ];

    return (
        <div style={{ display: 'flex', height: '100vh', padding: '0 1rem' }}>
            {/* Sidebar Actions */}
            <div className="glass" style={{ width: '300px', padding: '1.5rem', margin: '1rem 0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem' }}>Available Actions</h3>
                {actions.map(group => (
                    <div key={group.group}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>{group.group}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {group.items.map(action => (
                                <button key={action.id} className="btn" style={{ background: 'rgba(255,255,255,0.05)', fontSize: '0.875rem', justifyContent: 'flex-start' }} onClick={() => addStep(action.id)}>
                                    {action.icon} {action.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Main Builder Area */}
            <div style={{ flex: 1, maxWidth: '65vw', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <button className="btn" style={{ background: 'transparent' }} onClick={() => navigate(-1)}><ArrowLeft size={18} /></button>
                        <div>
                            <h2 style={{ marginBottom: '0.25rem' }}>Test Builder</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className={`badge ${test?.status === 'Published' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.7rem' }}>
                                    {test?.status || 'Draft'}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{test?.name}</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button className="btn" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)' }} onClick={publishTest} disabled={test?.status === 'Published'}>
                            <CheckCircle size={18} /> {test?.status === 'Published' ? 'Published' : 'Publish'}
                        </button>
                        <button className="btn" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }} onClick={saveTest}><Save size={18} /> Save</button>
                        {window.location.hostname !== 'localhost' && (
                            <a 
                                href="http://localhost:3000" 
                                className="btn" 
                                style={{ background: 'var(--success)', color: 'white', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}
                            >
                                🚀 Open Locally
                            </a>
                        )}
                        <button className="btn btn-primary" onClick={runTest} disabled={running}>
                            {running ? <Clock size={18} className="spin" /> : <Play size={18} />}
                            {running ? 'Running...' : 'Run Test'}
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {steps.length === 0 && (
                        <div className="glass" style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                            <Plus size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                            <p>No steps added yet. Choose an action from the sidebar to begin.</p>
                        </div>
                    )}
                    {steps.map((step, index) => (
                        <div key={index} className="glass card" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', position: 'relative' }}>
                            <div style={{ background: 'var(--primary)', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                {index + 1}
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 'bold', minWidth: '120px' }}>{step.type.replace('_', ' ')}</div>
                                    <input
                                        placeholder="Add a label for this step (e.g. 'Enter Email')"
                                        style={{ flex: 1, height: '32px', fontSize: '0.875rem' }}
                                        value={step.payload.label || ''}
                                        onChange={e => updateStep(index, { label: e.target.value })}
                                    />
                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                        <button
                                            onClick={() => moveStep(index, 'up')}
                                            disabled={index === 0}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: index === 0 ? 'not-allowed' : 'pointer', padding: '4px' }}
                                        >
                                            <MoveUp size={16} />
                                        </button>
                                        <button
                                            onClick={() => moveStep(index, 'down')}
                                            disabled={index === steps.length - 1}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: index === steps.length - 1 ? 'not-allowed' : 'pointer', padding: '4px' }}
                                        >
                                            <MoveDown size={16} />
                                        </button>
                                        <button
                                            onClick={() => removeStep(index)}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '4px' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    {step.type === 'OPEN_URL' && <input placeholder="URL" value={step.payload.url || ''} onChange={e => updateStep(index, { url: e.target.value })} />}
                                    {['CLICK', 'WAIT_FOR'].includes(step.type) && (
                                        <>
                                            <select
                                                style={{ width: '120px' }}
                                                value={step.payload.strategy || 'css'}
                                                onChange={e => updateStep(index, { strategy: e.target.value })}
                                            >
                                                <option value="css">CSS Selector</option>
                                                <option value="label">Label Text</option>
                                            </select>
                                            <input
                                                placeholder={step.payload.strategy === 'label' ? "Label Text (e.g. 'Sign In')" : "Selector (e.g. .btn-primary)"}
                                                value={step.payload.selector || ''}
                                                onChange={e => updateStep(index, { selector: e.target.value })}
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>M.Index:</span>
                                                <input
                                                    type="number"
                                                    style={{ width: '60px' }}
                                                    value={step.payload.matchIndex || 1}
                                                    onChange={e => updateStep(index, { matchIndex: parseInt(e.target.value) || 1 })}
                                                />
                                            </div>
                                        </>
                                    )}
                                    {step.type === 'INPUT' && (
                                        <>
                                            <select
                                                style={{ width: '120px' }}
                                                value={step.payload.strategy || 'css'}
                                                onChange={e => updateStep(index, { strategy: e.target.value })}
                                            >
                                                <option value="css">CSS Selector</option>
                                                <option value="label">Label Text</option>
                                            </select>
                                            <input
                                                placeholder={step.payload.strategy === 'label' ? "Label Text (e.g. 'Email')" : "Selector (e.g. [name='email'])"}
                                                value={step.payload.selector || ''}
                                                onChange={e => updateStep(index, { selector: e.target.value })}
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>M.Index:</span>
                                                <input
                                                    type="number"
                                                    style={{ width: '60px' }}
                                                    value={step.payload.matchIndex || 1}
                                                    onChange={e => updateStep(index, { matchIndex: parseInt(e.target.value) || 1 })}
                                                />
                                            </div>
                                            <input placeholder="Value to enter" value={step.payload.value || ''} onChange={e => updateStep(index, { value: e.target.value })} />
                                        </>
                                    )}
                                    {['GET', 'POST', 'PUT', 'DELETE'].includes(step.type) && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                                            <input
                                                placeholder="Full API URL (e.g. https://api.example.com/data/1)"
                                                value={step.payload.url || ''}
                                                onChange={e => updateStep(index, { url: e.target.value })}
                                            />
                                            <div style={{ display: 'flex', gap: '1rem' }}>
                                                <input
                                                    type="number"
                                                    placeholder="Expected Status (e.g. 200)"
                                                    style={{ width: '200px' }}
                                                    value={step.payload.expectedStatus || ''}
                                                    onChange={e => updateStep(index, { expectedStatus: parseInt(e.target.value) })}
                                                />
                                                <input
                                                    placeholder="Headers (JSON format)"
                                                    style={{ flex: 1 }}
                                                    value={step.payload.headersText || ''}
                                                    onChange={e => updateStep(index, { headersText: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {step.type === 'VALIDATE_STATUS' && <input type="number" placeholder="Expected Status" value={step.payload.expectedStatus || ''} onChange={e => updateStep(index, { expectedStatus: parseInt(e.target.value) })} />}
                                    {step.type === 'INTERCEPT_API' && (
                                        <>
                                            <input
                                                placeholder="URL contains (e.g. /api/workflow/)"
                                                style={{ flex: 1 }}
                                                value={step.payload.urlPattern || ''}
                                                onChange={e => updateStep(index, { urlPattern: e.target.value })}
                                            />
                                            <select
                                                style={{ width: '100px' }}
                                                value={step.payload.method || 'ANY'}
                                                onChange={e => updateStep(index, { method: e.target.value })}
                                            >
                                                <option value="ANY">ANY</option>
                                                <option value="GET">GET</option>
                                                <option value="POST">POST</option>
                                                <option value="PUT">PUT</option>
                                                <option value="DELETE">DELETE</option>
                                            </select>
                                            <input
                                                type="number"
                                                placeholder="Expected Status"
                                                style={{ width: '120px' }}
                                                value={step.payload.expectedStatus || ''}
                                                onChange={e => updateStep(index, { expectedStatus: parseInt(e.target.value) })}
                                            />
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {running && (
                    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '2rem' }}>
                        <div className="glass" style={{ width: '90%', maxWidth: '1200px', height: '80%', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '2px solid var(--primary)', borderRadius: '16px', boxShadow: '0 0 50px rgba(79, 70, 229, 0.4)' }}>
                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ff5f56' }}></div>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ffbd2e' }}></div>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#27c93f' }}></div>
                                </div>
                                <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', padding: '0.25rem 1rem', borderRadius: '6px', fontSize: '0.875rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{window.location.hostname === 'localhost' ? '🏠 Local Automation Monitor' : '☁️ Live Cloud Monitor'} - Running Test #{testId}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div className="spin" style={{ width: '10px', height: '10px', border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                                        <span style={{ fontSize: '0.75rem' }}>EXECUTING...</span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
                                {/* Left Side: Live Browser Snapshot */}
                                <div style={{ flex: 1, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)' }}>
                                    {result?.liveView ? (
                                        <img 
                                            src={`data:image/jpeg;base64,${result.liveView}`} 
                                            alt="Live Browser Feed" 
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                                        />
                                    ) : result?.snapshots && result.snapshots.length > 0 ? (
                                        <img 
                                            src={`${API_BASE_URL}/screenshots/${result.snapshots[result.snapshots.length - 1].fileName}`} 
                                            alt="Last Snapshot" 
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        />
                                    ) : (
                                        <div style={{ textAlign: 'center', opacity: 0.5 }}>
                                            <div className="spin" style={{ margin: '0 auto 1rem' }}></div>
                                            <p>{window.location.hostname === 'localhost' ? 'Opening Browser on Desktop...' : 'Launching Cloud Chrome...'}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Right Side: Live Logs */}
                                <div style={{ width: '350px', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' }}>
                                    <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', fontWeight: '600', fontSize: '0.875rem' }}>
                                        Execution Logs
                                    </div>
                                    <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                        {result?.logs ? result.logs.split('\n').map((log, i) => (
                                            <div key={i} style={{ marginBottom: '0.5rem', borderLeft: '2px solid var(--primary)', paddingLeft: '0.75rem', color: 'rgba(255,255,255,0.9)' }}>{log}</div>
                                        )) : (
                                            <div className="blink" style={{ color: 'var(--primary)' }}>_ [WAITING...]</div>
                                        )}
                                        <div ref={el => el?.scrollIntoView({ behavior: 'smooth' })}></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <p style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                                {window.location.hostname === 'localhost' 
                                    ? '🚀 A real Google Chrome browser is opening on your machine!' 
                                    : 'A real Google Chrome browser is executing your test in the cloud.'}
                            </p>
                            <p style={{ color: 'var(--text-muted)' }}>Snapshots and logs are being streamed live above.</p>
                            <button className="btn" style={{ marginTop: '1rem', background: 'var(--error)' }} onClick={() => setRunning(false)}>Stop Session</button>
                        </div>
                    </div>
                )}

                {result && (
                    <div className="glass card" style={{ marginTop: '2rem', borderLeft: `4px solid ${result.status === 'Passed' ? 'var(--success)' : 'var(--error)'}` }}>
                        <h3>Test Results</h3>
                        <div style={{ display: 'flex', gap: '2rem', margin: '1rem 0' }}>
                            <div>Status: <span className={`badge ${result.status === 'Passed' ? 'badge-success' : 'badge-error'}`}>{result.status}</span></div>
                            <div>Duration: {result.executionTime}ms</div>
                        </div>

                        {result.snapshots && result.snapshots.length > 0 && (
                            <div style={{ marginBottom: '2rem' }}>
                                <h4 style={{ marginBottom: '1rem' }}>Visual Step Snapshots</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                    {result.snapshots.map((snap, i) => (
                                        <div key={i} className="glass" style={{ padding: '0.5rem', borderRadius: '8px' }}>
                                            <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>Step {snap.stepOrder}: {snap.label}</div>
                                            <img 
                                                src={`${API_BASE_URL}/screenshots/${snap.fileName}`} 
                                                alt={snap.label} 
                                                style={{ width: '100%', borderRadius: '4px', cursor: 'pointer' }}
                                                onClick={() => window.open(`${API_BASE_URL}/screenshots/${snap.fileName}`, '_blank')}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', fontSize: '0.875rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {result.logs}
                        </div>

                        {result.networkHistory && result.networkHistory.length > 0 && (
                            <div style={{ marginTop: '2rem' }}>
                                <h4 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Activity size={18} color="var(--primary)" /> Detailed Network Logs
                                </h4>
                                <div className="glass" style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(255,255,255,0.1)', borderBottom: '2px solid var(--primary)' }}>
                                                <th style={{ padding: '1rem', textAlign: 'left', width: '80px', color: '#fff', fontWeight: 'bold' }}>Method</th>
                                                <th style={{ padding: '1rem', textAlign: 'left', color: '#fff', fontWeight: 'bold' }}>URL / Endpoint</th>
                                                <th style={{ padding: '1rem', textAlign: 'left', width: '100px', color: '#fff', fontWeight: 'bold' }}>Status</th>
                                                <th style={{ padding: '1rem', textAlign: 'center', width: '120px', color: '#fff', fontWeight: 'bold' }}>Payload</th>
                                                <th style={{ padding: '1rem', textAlign: 'center', width: '120px', color: '#fff', fontWeight: 'bold' }}>Response</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.networkHistory
                                                .filter(item => !test?.apiBaseUrl || item.url.toLowerCase().includes(test.apiBaseUrl.toLowerCase()))
                                                .map((item, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', verticalAlign: 'middle', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                                                        <td style={{ padding: '0.75rem 1rem' }}>
                                                            <span className={`badge ${item.method === 'POST' ? 'badge-primary' : item.method === 'GET' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '0.7rem', width: '55px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>{item.method}</span>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem' }}>
                                                            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#fff', marginBottom: '2px' }}>
                                                                {(() => {
                                                                    try { return new URL(item.url).pathname; }
                                                                    catch (e) { return item.url; }
                                                                })()}
                                                            </div>
                                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.url}>
                                                                {item.url}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.status >= 400 ? '#ff4b2b' : '#00f2fe', boxShadow: `0 0 10px ${item.status >= 400 ? '#ff4b2b' : '#00f2fe'}` }}></div>
                                                                <span style={{ color: item.status >= 400 ? '#ff4b2b' : '#00f2fe', fontWeight: '800', fontSize: '1rem' }}>{item.status}</span>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                            {item.payload ? (
                                                                <button className="btn" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }} onClick={() => alert(item.payload)}>View Data</button>
                                                            ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>None</span>}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                            {item.responseBody ? (
                                                                <button className="btn btn-primary" style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }} onClick={() => alert(item.responseBody)}>View Body</button>
                                                            ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>No Data</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TestBuilder;
