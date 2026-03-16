import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Play, Edit3, Trash2, ArrowLeft, Terminal, Layout, FileCode } from 'lucide-react';

const Tests = () => {
    const { projectId } = useParams();
    const [tests, setTests] = useState([]);
    const [project, setProject] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [newTest, setNewTest] = useState({ name: '', type: 'API' });
    const navigate = useNavigate();

    useEffect(() => {
        fetch(`https://testingbackend-xia0.onrender.com/api/projects/${projectId}/tests`).then(res => res.json()).then(setTests);
        // Fetch project details too if needed
    }, [projectId]);

    const handleCreateTest = (e) => {
        e.preventDefault();
        fetch('https://testingbackend-xia0.onrender.com/api/tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...newTest, projectId: parseInt(projectId) })
        }).then(res => res.json()).then(data => {
            navigate(`/tests/${data.id}/builder`);
        });
    };

    return (
        <div style={{ padding: '2rem' }}>
            <button className="btn" style={{ background: 'transparent', marginBottom: '1rem' }} onClick={() => navigate('/projects')}>
                <ArrowLeft size={18} /> Back to Projects
            </button>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2>Test Cases</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Create and manage UI and API tests</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={18} /> New Test Case</button>
            </div>

            <div className="glass" style={{ overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)' }}>
                            <th style={{ padding: '1rem' }}>Test Name</th>
                            <th style={{ padding: '1rem' }}>Type</th>
                            <th style={{ padding: '1rem' }}>Status</th>
                            <th style={{ padding: '1rem' }}>Last Result</th>
                            <th style={{ padding: '1rem' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tests.map(test => (
                            <tr key={test.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ fontWeight: '600' }}>{test.name}</div>
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        {test.type === 'API' ? <Terminal size={14} color="var(--primary)" /> : <Layout size={14} color="#10b981" />}
                                        {test.type}
                                    </div>
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <span className={`badge ${test.status === 'Published' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '0.75rem' }}>
                                        {test.status || 'Draft'}
                                    </span>
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    {test.lastStatus ? (
                                        <span className={`badge ${test.lastStatus === 'Passed' ? 'badge-success' : 'badge-error'}`}>
                                            {test.lastStatus}
                                        </span>
                                    ) : (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Not run</span>
                                    )}
                                </td>
                                <td style={{ padding: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button className="btn" style={{ background: 'var(--primary)', padding: '0.5rem' }} onClick={() => navigate(`/tests/${test.id}/builder`)}><Edit3 size={16} color="white" /></button>
                                        <button className="btn" style={{ background: 'var(--success)', padding: '0.5rem' }}><Play size={16} color="white" /></button>
                                        <button className="btn" style={{ background: 'transparent', padding: '0.5rem', color: 'var(--error)' }}><Trash2 size={16} /></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <form onSubmit={handleCreateTest} className="glass" style={{ width: '400px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <h3>Create New Test Case</h3>
                        <input placeholder="Test Name" value={newTest.name} onChange={e => setNewTest({...newTest, name: e.target.value})} required />
                        <select value={newTest.type} onChange={e => setNewTest({...newTest, type: e.target.value})}>
                            <option value="API">API Test</option>
                            <option value="UI">Web UI Test</option>
                        </select>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button type="button" className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }} onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Continue</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Tests;
