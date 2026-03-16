import React, { useState, useEffect } from 'react';
import { Plus, Globe, Link2, FileText, ChevronRight, Play, Edit3, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Projects = () => {
    const [projects, setProjects] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [newProject, setNewProject] = useState({ name: '', websiteUrl: '', apiBaseUrl: '', description: '' });
    const navigate = useNavigate();

    useEffect(() => {
        fetch('https://testingbackend-xia0.onrender.com/api/projects').then(res => res.json()).then(setProjects);
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        fetch('https://testingbackend-xia0.onrender.com/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newProject)
        }).then(res => res.json()).then(data => {
            setProjects([...projects, { ...newProject, id: data.id }]);
            setShowModal(false);
            setNewProject({ name: '', websiteUrl: '', apiBaseUrl: '', description: '' });
        });
    };

    return (
        <div style={{ padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2>Projects</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Manage your testing environments</p>
                </div>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={18} /> New Project</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {projects.map(project => (
                    <div key={project.id} className="glass card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ background: 'var(--primary)', padding: '0.75rem', borderRadius: '10px' }}>
                                <Globe size={24} color="white" />
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn" style={{ background: 'transparent', padding: '0.5rem' }}><Edit3 size={16} /></button>
                                <button className="btn" style={{ background: 'transparent', padding: '0.5rem', color: 'var(--error)' }}><Trash2 size={16} /></button>
                            </div>
                        </div>
                        <div>
                            <h3 style={{ marginBottom: '0.25rem' }}>{project.name}</h3>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{project.description}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                <Globe size={14} /> {project.websiteUrl}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                                <Link2 size={14} /> {project.apiBaseUrl}
                            </div>
                        </div>
                        <button 
                            className="btn btn-primary" 
                            style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}
                            onClick={() => navigate(`/projects/${project.id}/tests`)}
                        >
                            View Tests <ChevronRight size={16} />
                        </button>
                    </div>
                ))}
            </div>

            {showModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <form onSubmit={handleSubmit} className="glass" style={{ width: '500px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <h3>Create New Project</h3>
                        <input placeholder="Project Name" value={newProject.name} onChange={e => setNewProject({...newProject, name: e.target.value})} required />
                        <input placeholder="Website URL (e.g. https://google.com)" value={newProject.websiteUrl} onChange={e => setNewProject({...newProject, websiteUrl: e.target.value})} required />
                        <input placeholder="API Base URL (e.g. https://api.example.com)" value={newProject.apiBaseUrl} onChange={e => setNewProject({...newProject, apiBaseUrl: e.target.value})} required />
                        <textarea placeholder="Description" rows="3" value={newProject.description} onChange={e => setNewProject({...newProject, description: e.target.value})} />
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button type="button" className="btn" style={{ flex: 1, background: 'rgba(255,255,255,0.1)' }} onClick={() => setShowModal(false)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Create Project</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default Projects;
