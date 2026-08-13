import { render, screen } from '@testing-library/react';
import App from './App';

test('carga la aplicación y muestra la pantalla principal tras validar la licencia', async () => {
    render(<App />);
    expect(await screen.findByText('Registro QR')).toBeInTheDocument();
    expect(screen.getByText('Sistema de Registro QR')).toBeInTheDocument();
});
