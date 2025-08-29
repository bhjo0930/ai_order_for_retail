'use client';

import React from 'react';

interface LoadingIndicatorProps {
  size?: 'small' | 'medium' | 'large';
  message?: string;
  variant?: 'spinner' | 'dots' | 'pulse' | 'bars';
  className?: string;
}

export function LoadingIndicator({ 
  size = 'medium', 
  message, 
  variant = 'spinner',
  className = '' 
}: LoadingIndicatorProps) {
  const sizeClasses = {
    small: 'w-4 h-4',
    medium: 'w-8 h-8',
    large: 'w-12 h-12',
  };

  const renderSpinner = () => (
    <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]}`} />
  );

  const renderDots = () => (
    <div className="flex space-x-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`bg-blue-600 rounded-full animate-pulse ${
            size === 'small' ? 'w-1 h-1' : size === 'medium' ? 'w-2 h-2' : 'w-3 h-3'
          }`}
          style={{
            animationDelay: `${i * 0.2}s`,
            animationDuration: '1s',
          }}
        />
      ))}
    </div>
  );

  const renderPulse = () => (
    <div className={`bg-blue-600 rounded-full animate-pulse ${sizeClasses[size]}`} />
  );

  const renderBars = () => (
    <div className="flex space-x-1 items-end">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`bg-blue-600 animate-pulse ${
            size === 'small' ? 'w-1' : size === 'medium' ? 'w-1.5' : 'w-2'
          }`}
          style={{
            height: `${12 + (i % 2) * 8}px`,
            animationDelay: `${i * 0.15}s`,
            animationDuration: '0.8s',
          }}
        />
      ))}
    </div>
  );

  const renderIndicator = () => {
    switch (variant) {
      case 'dots':
        return renderDots();
      case 'pulse':
        return renderPulse();
      case 'bars':
        return renderBars();
      default:
        return renderSpinner();
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center space-y-2 ${className}`}>
      {renderIndicator()}
      {message && (
        <p className={`text-gray-600 text-center ${
          size === 'small' ? 'text-xs' : size === 'medium' ? 'text-sm' : 'text-base'
        }`}>
          {message}
        </p>
      )}
    </div>
  );
}

// Voice-specific loading indicator
export function VoiceLoadingIndicator({ 
  isListening = false, 
  isProcessing = false,
  audioLevel = 0,
  message 
}: {
  isListening?: boolean;
  isProcessing?: boolean;
  audioLevel?: number;
  message?: string;
}) {
  if (isListening) {
    return (
      <div className="flex flex-col items-center space-y-3">
        <div className="relative">
          {/* Microphone icon */}
          <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
          </div>
          
          {/* Audio level indicator */}
          <div 
            className="absolute inset-0 rounded-full border-4 border-red-300 animate-pulse"
            style={{
              transform: `scale(${1 + audioLevel * 0.3})`,
              opacity: 0.7,
            }}
          />
        </div>
        
        <p className="text-sm text-gray-600 text-center">
          {message || 'Listening...'}
        </p>
        
        {/* Sound waves animation */}
        <div className="flex space-x-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-1 bg-red-400 rounded-full animate-pulse"
              style={{
                height: `${8 + Math.sin(Date.now() / 200 + i) * 4}px`,
                animationDelay: `${i * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center space-y-3">
        <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        
        <p className="text-sm text-gray-600 text-center">
          {message || 'Processing...'}
        </p>
      </div>
    );
  }

  return null;
}

// Progress bar component
export function ProgressBar({ 
  progress, 
  message, 
  variant = 'default',
  className = '' 
}: {
  progress: number; // 0-100
  message?: string;
  variant?: 'default' | 'success' | 'warning' | 'error';
  className?: string;
}) {
  const variantClasses = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    error: 'bg-red-600',
  };

  return (
    <div className={`w-full ${className}`}>
      {message && (
        <p className="text-sm text-gray-600 mb-2">{message}</p>
      )}
      
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${variantClasses[variant]}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      
      <p className="text-xs text-gray-500 mt-1 text-right">
        {Math.round(progress)}%
      </p>
    </div>
  );
}

// Skeleton loader for content
export function SkeletonLoader({ 
  lines = 3, 
  className = '' 
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`bg-gray-300 rounded h-4 mb-2 ${
            i === lines - 1 ? 'w-3/4' : 'w-full'
          }`}
        />
      ))}
    </div>
  );
}

// Card skeleton loader
export function CardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse ${className}`}>
      <div className="bg-gray-300 rounded-lg h-48 mb-4" />
      <div className="bg-gray-300 rounded h-4 mb-2" />
      <div className="bg-gray-300 rounded h-4 w-3/4 mb-2" />
      <div className="bg-gray-300 rounded h-4 w-1/2" />
    </div>
  );
}