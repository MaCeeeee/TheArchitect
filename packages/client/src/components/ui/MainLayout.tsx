import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import BreadcrumbBar from './BreadcrumbBar';
import BPMNImportDialog from './BPMNImportDialog';
import N8nImportDialog from './N8nImportDialog';
import CSVImportDialog from './CSVImportDialog';
import Walkthrough from './Walkthrough';
import TeamChat from '../collaboration/TeamChat';
import MFASetup from '../security/MFASetup';
import { useUIStore } from '../../stores/uiStore';

export default function MainLayout() {
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const isChatOpen = useUIStore((s) => s.showChat);
  const toggleChat = useUIStore((s) => s.toggleChat);
  const [showBPMNImport, setShowBPMNImport] = useState(false);
  const [showN8nImport, setShowN8nImport] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showMFASetup, setShowMFASetup] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--surface-base)]">
      {/* Sidebar */}
      {isSidebarOpen && <Sidebar />}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Toolbar
          onOpenBPMNImport={() => setShowBPMNImport(true)}
          onOpenN8nImport={() => setShowN8nImport(true)}
          onOpenCSVImport={() => setShowCSVImport(true)}
          onOpenWalkthrough={() => setShowWalkthrough(true)}
        />
        <BreadcrumbBar />
        <main className="flex-1 relative">
          <Outlet />
          {/* Collaboration overlays */}
          <TeamChat isOpen={isChatOpen} onClose={toggleChat} />
        </main>
      </div>

      {/* Modals */}
      <BPMNImportDialog isOpen={showBPMNImport} onClose={() => setShowBPMNImport(false)} />
      <N8nImportDialog isOpen={showN8nImport} onClose={() => setShowN8nImport(false)} />
      <CSVImportDialog isOpen={showCSVImport} onClose={() => setShowCSVImport(false)} />
      <Walkthrough isOpen={showWalkthrough} onClose={() => setShowWalkthrough(false)} />
      <MFASetup isOpen={showMFASetup} onClose={() => setShowMFASetup(false)} />
    </div>
  );
}
