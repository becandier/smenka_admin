import { LoginForm } from 'react-admin';
import { Box, Card, CardContent } from '@mui/material';
import { brand } from '../brand';

// Брендированный экран входа: лок-ап по центру, фон wash, форма с primary-кнопкой.
// LoginForm берёт useLogin → authProvider (логику данных не трогаем).
export const LoginPage = () => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      bgcolor: brand.wash,
      p: 2,
    }}
  >
    <Box
      component="img"
      src="/smenka-lockup-color.svg"
      alt="Smenka"
      sx={{ width: 220, maxWidth: '70%', mb: 3 }}
    />
    <Card sx={{ width: '100%', maxWidth: 360 }}>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  </Box>
);
