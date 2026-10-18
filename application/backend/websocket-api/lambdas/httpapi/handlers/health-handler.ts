import HealthResponse from '@protocol/responses/health-response';
import HealthRepository from '@repositories/health-repository';

const healthRepository: HealthRepository = new HealthRepository();

/**
 * Tells the API is up once its database answers: the pages using the APIs wait for it, the paused database resuming
 * meanwhile, 28 seconds at most (the timeout of the lambda)
 * @throws {DatabaseException} when the database fails, or is still resuming
 */
export async function healthHandler(): Promise<HealthResponse> {
    await healthRepository.ping();
    return { status: 'up' };
}
