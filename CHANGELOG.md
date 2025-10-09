# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2024-12-19

### Added
- Added `deepEqual` utility function for improved object comparison
- Enhanced performance by using deep equality checks to prevent unnecessary re-renders
- Added support for more efficient state updates with deep comparison

### Changed
- Updated internal state comparison logic to use the new `deepEqual` utility
- Improved performance for complex nested state objects
- Enhanced demo application with better examples showcasing async functionality

### Fixed
- Fixed potential unnecessary re-renders when state objects have the same content but different references
- Improved memory efficiency by preventing redundant state updates

## [1.2.0] - 2024-12-18

### Added
- Async store support with `.async()` method
- Async derived stores with automatic dependency tracking
- Error handling utilities: `isError`, `isSuccess`, `isLoading`, `getErrorMessage`, `getErrorStatus`
- Storage-backed stores with `.local()` and `.session()` methods
- Derived stores with `.derive()` method for computed values
- Nested property access for stores
- Individual hooks: `useStoreValue` and `useStoreSetter`

### Changed
- Complete rewrite of the core state management system
- Improved performance with proxy-based state management
- Enhanced TypeScript support

### Removed
- Legacy state management approach
- Old API methods

## [1.1.0] - 2024-12-17

### Added
- Initial release of the react-store library
- Basic store creation and management
- React hooks integration
- TypeScript definitions

## [1.0.0] - 2024-12-16

### Added
- Initial project setup
- Basic documentation
- License and package configuration
