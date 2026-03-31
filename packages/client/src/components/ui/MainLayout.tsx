import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import BreadcrumbBar from './BreadcrumbBar';
import BPMNImportDialog from './BPMNImportDialog';
import N8nImportDialog from './N8nImportDialog';
import CSVImportDialog from './CSVImportDialog';
import ImportMappingDialog from '../import/ImportMappingDialog';
import Walkthrough from './Walkthrough';
import TeamChat from '../collaboration/TeamChat';
import MFASetup from '../security/MFASetup';
import { useUIStore } from '../../stores/uiStore';
import { useArchitectureStore } from '../../stores/architectureStore';

export default function MainLayout() {
  const isSidebarOpen = useUIStore((s) => s.isSidebarOpen);
  const isChatOpen = useUIStore((s) => s.showChat);
  const toggleChat = useUIStore((s) => s.toggleChat);
  const [showBPMNImport, setShowBPMNImport] = useState(false);
  const [showN8nImport, setShowN8nImport] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showImportMapping, setShowImportMapping] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const projectId = useArchitectureStore((s) => s.projectId);
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
          onOpenImportMapping={projectId ? () => setShowImportMapping(true) : undefined}
          onOpenWalkthrough={() => setShowWalkthrough(true)}
        />
        <BreadcrumbBar />
        <main className="flex-1 relative overflow-hidden">
          <Outlet />
          {/* Collaboration overlays */}
          <TeamChat isOpen={isChatOpen} onClose={toggleChat} />
        </main>
      </div>

      {/* Modals */}
      <BPMNImportDialog isOpen={showBPMNImport} onClose={() => setShowBPMNImport(false)} />
      <N8nImportDialog isOpen={showN8nImport} onClose={() => setShowN8nImport(false)} />
      <CSVImportDialog isOpen={showCSVImport} onClose={() => setShowCSVImport(false)} />
      {projectId && (
        <ImportMappingDialog
          isOpen={showImportMapping}
          onClose={() => setShowImportMapping(false)}
          projectId={projectId}
          onImportComplete={() => setShowImportMapping(false)}
        />
      )}
      <Walkthrough isOpen={showWalkthrough} onClose={() => setShowWalkthrough(false)} />
      <MFASetup isOpen={showMFASetup} onClose={() => setShowMFASetup(false)} />
    </div>
  );
}
