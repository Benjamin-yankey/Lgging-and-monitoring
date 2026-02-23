const request = require('supertest');
const app = require('./app');

let server;

beforeAll(() => {
    // Don't start server in tests - supertest handles it
});

afterAll((done) => {
    // Close any open handles
    if (server) {
        server.close(done);
    } else {
        done();
    }
});

describe('App Tests', () => {
    test('GET /api/info should return success message', async () => {
        const response = await request(app).get('/api/info');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('running');
        expect(response.body.version).toBeDefined();
        expect(response.body.deploymentTime).toBeDefined();
    });

    test('GET /health should return healthy status', async () => {
        const response = await request(app).get('/health');
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
    });

    test('GET / should return HTML page', async () => {
        const response = await request(app).get('/');
        expect(response.status).toBe(200);
        expect(response.type).toBe('text/html');
        expect(response.text).toContain('Timesheet Tracker');
    });
});