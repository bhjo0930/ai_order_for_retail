import React from 'react';
import { render, screen } from '@testing-library/react';
import VoiceRecorder from '../VoiceRecorder';

// Mocking browser APIs that are not available in JSDOM
global.navigator.mediaDevices = {
  ...global.navigator.mediaDevices,
  getUserMedia: jest.fn().mockResolvedValue({}),
};

window.WebSocket = jest.fn().mockImplementation(() => ({
    onopen: jest.fn(),
    onmessage: jest.fn(),
    onclose: jest.fn(),
    onerror: jest.fn(),
    close: jest.fn(),
    send: jest.fn(),
})) as any;

window.MediaRecorder = jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    ondataavailable: jest.fn(),
})) as any;


describe('VoiceRecorder', () => {
  it('renders the component and initial UI', () => {
    render(<VoiceRecorder />);

    // Check if the main title is there
    expect(screen.getByText('Voice Assistant')).toBeInTheDocument();

    // Check if the start button is there
    const startButton = screen.getByRole('button', { name: /Start Listening/i });
    expect(startButton).toBeInTheDocument();
  });
});
