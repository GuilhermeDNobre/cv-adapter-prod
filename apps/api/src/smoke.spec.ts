import { describe, expect, it } from 'vitest';
import { AppController } from './app.controller';

describe('api smoke test', () => {
  it('should return health status ok', () => {
    // Arrange
    const controller = new AppController();

    // Act
    const result = controller.check();

    // Assert
    expect(result).toEqual({ status: 'ok' });
  });
});
