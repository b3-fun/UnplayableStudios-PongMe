import fetch from 'node-fetch';

const Logger = {
  log: (message: string, ...args: any[]) => console.log(`[INFO] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${message}`, ...args),
};

interface BasementTriggerParams {
    launcherJwt: string;
    trigger: string;
    value: number;
    nonce: string;
}

interface BasementSendCustomActivityParams {
    launcherJwt: string;
    label: string;
    eventId: string;
}

interface ApiResponse {
    success: boolean;
    data?: any;
    error?: string;
}

const logger = Logger;
const BASEMENT_API_URL = 'https://api.basement.fun/launcher/';

export const TriggerName = Object.freeze({
    WIN: 'win',
    LOSE: 'lose',
    LEADERBOARD: 'leaderboard'
});

export const basementTrigger = async ({
                                          launcherJwt,
                                          trigger,
                                          value,
                                          nonce,
                                      }: BasementTriggerParams): Promise<ApiResponse> => {
    if (!process.env.BASEMENT_GAME_TOKEN) {
        logger.error('BASEMENT_GAME_TOKEN is not defined');
        throw new Error('BASEMENT_GAME_TOKEN is not defined in environment variables');
    }

    try {
        logger.log('Attempting to call basement trigger');
        const requestBody = { launcherJwt, trigger, nonce, value };
        logger.debug('Request body:', requestBody);

        const response = await fetch(BASEMENT_API_URL, {
            method: 'POST',
            headers: {
                'X-Service-Method': 'triggerRulesEngine',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.BASEMENT_GAME_TOKEN}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`Failed with status: ${response.status}`);
            logger.error('Error response:', errorText);
            throw new Error(`Failed: ${response.statusText}. Response: ${errorText}`);
        }

        const responseData = await response.json();
        logger.log('Successful:', responseData);

        return { success: true };
    } catch (error) {
        logger.error('Error:', error);
        logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
    }
}

export const basementSendCustomActivity = async ({
                                                     launcherJwt,
                                                     label,
                                                     eventId,
                                                 }: BasementSendCustomActivityParams): Promise<ApiResponse> => {
    if (!process.env.BASEMENT_GAME_TOKEN) {
        logger.error('BASEMENT_GAME_TOKEN is not defined');
        throw new Error('BASEMENT_GAME_TOKEN is not defined in environment variables');
    }

    try {
        logger.log('Attempting to call basement SendCustomActivity');
        const requestBody = { launcherJwt, label, eventId };
        logger.debug('Request body:', requestBody);

        const response = await fetch(BASEMENT_API_URL, {
            method: 'POST',
            headers: {
                'X-Service-Method': 'sendCustomActivity',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.BASEMENT_GAME_TOKEN}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`Failed with status: ${response.status}`);
            logger.error('Error response:', errorText);
            throw new Error(`Failed: ${response.statusText}. Response: ${errorText}`);
        }

        const responseData = await response.json();
        logger.log('Successful:', responseData);

        return { success: true };
    } catch (error) {
        logger.error('Error:', error);
        logger.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

        return {
            success: false,
            error: error instanceof Error ? error.message : 'An unknown error occurred',
        };
    }
}

export function formatAddress(address: string) {
    return `@${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatUsername(username: string) {
    return '@' + username.split('.')[0];
}