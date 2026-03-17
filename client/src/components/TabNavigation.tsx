import { Tabs, Tab, Box, ToggleButtonGroup, ToggleButton } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import PersonIcon from '@mui/icons-material/Person';
import ViewListIcon from '@mui/icons-material/ViewList';
import GridViewIcon from '@mui/icons-material/GridView';
import type { ActiveTab, RoundViewMode } from '../types';

interface TabNavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  roundViewMode?: RoundViewMode;
  onRoundViewModeChange?: (mode: RoundViewMode) => void;
}

export function TabNavigation({
  activeTab,
  onTabChange,
  roundViewMode = 'compact',
  onRoundViewModeChange,
}: TabNavigationProps) {
  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    const tabs: ActiveTab[] = ['round', 'team', 'bye', 'player'];
    onTabChange(tabs[newValue] ?? 'round');
  };

  const handleViewModeChange = (
    _event: React.MouseEvent<HTMLElement>,
    newMode: RoundViewMode | null
  ) => {
    if (newMode !== null && onRoundViewModeChange) {
      onRoundViewModeChange(newMode);
    }
  };

  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        mb: 3,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Tabs
        value={activeTab === 'round' ? 0 : activeTab === 'team' ? 1 : activeTab === 'bye' ? 2 : 3}
        onChange={handleChange}
        aria-label="Schedule view tabs"
      >
        <Tab
          icon={<CalendarMonthIcon />}
          iconPosition="start"
          label="Round Overview"
          id="tab-round"
          aria-controls="tabpanel-round"
        />
        <Tab
          icon={<GroupsIcon />}
          iconPosition="start"
          label="Team Schedule"
          id="tab-team"
          aria-controls="tabpanel-team"
        />
        <Tab
          icon={<EventBusyIcon />}
          iconPosition="start"
          label="Bye Overview"
          id="tab-bye"
          aria-controls="tabpanel-bye"
        />
        <Tab
          icon={<PersonIcon />}
          iconPosition="start"
          label="Players"
          id="tab-player"
          aria-controls="tabpanel-player"
        />
      </Tabs>

      {activeTab === 'round' && onRoundViewModeChange && (
        <ToggleButtonGroup
          value={roundViewMode}
          exclusive
          onChange={handleViewModeChange}
          aria-label="Round view mode"
          size="small"
          sx={{ mb: 1 }}
        >
          <ToggleButton value="detailed" aria-label="Detailed view">
            <ViewListIcon sx={{ mr: 0.5 }} fontSize="small" />
            Detailed
          </ToggleButton>
          <ToggleButton value="compact" aria-label="Compact view">
            <GridViewIcon sx={{ mr: 0.5 }} fontSize="small" />
            Compact
          </ToggleButton>
        </ToggleButtonGroup>
      )}
    </Box>
  );
}
