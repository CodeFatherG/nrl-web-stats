import { Tabs, Tab, Box } from '@mui/material';
import GroupsIcon from '@mui/icons-material/Groups';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import type { ActiveTab } from '../types';

interface TabNavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  const handleChange = (_event: React.SyntheticEvent, newValue: number) => {
    onTabChange(newValue === 0 ? 'team' : 'round');
  };

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
      <Tabs
        value={activeTab === 'team' ? 0 : 1}
        onChange={handleChange}
        aria-label="Schedule view tabs"
      >
        <Tab
          icon={<GroupsIcon />}
          iconPosition="start"
          label="Team Schedule"
          id="tab-team"
          aria-controls="tabpanel-team"
        />
        <Tab
          icon={<CalendarMonthIcon />}
          iconPosition="start"
          label="Round Overview"
          id="tab-round"
          aria-controls="tabpanel-round"
        />
      </Tabs>
    </Box>
  );
}
