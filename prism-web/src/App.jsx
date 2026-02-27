import { useState } from 'react';
import Desktop from './pages/Desktop';
import NoveltyDashboard from './pages/NoveltyDashboard';
import Collaboration from './pages/Collaboration';
import Symphony from './pages/Symphony';
import ControlPanel from './pages/ControlPanel';
import Monitoring from './pages/Monitoring';

const tabs = ['Desktop','Novelty','Collab','Symphony','Control','Monitor'];

export default function App(){
  const [tab,setTab] = useState('Desktop');
  const render = () => {
    switch(tab){
      case 'Desktop': return <Desktop/>;
      case 'Novelty': return <NoveltyDashboard/>;
      case 'Collab': return <Collaboration/>;
      case 'Symphony': return <Symphony/>;
      case 'Control': return <ControlPanel/>;
      case 'Monitor': return <Monitoring/>;
      default: return null;
    }
  };
  return (
    <div className="h-screen flex flex-col">
      <nav className="flex gap-2 p-2 bg-gray-800 text-white">
        {tabs.map(t=>(
          <button key={t} onClick={()=>setTab(t)}>{t}</button>
        ))}
      </nav>
      <main className="flex-1 p-4 overflow-hidden">
        {render()}
      </main>
    </div>
  );
}
