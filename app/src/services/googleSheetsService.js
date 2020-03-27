/* eslint-disable consistent-return,require-yield */
const config = require('config');
const logger = require('logger');
const GoogleSpreadsheet = require('google-spreadsheet');

class GoogleSheetsService {

    constructor() {
        this.creds = config.get('googleSheets');
        this.doc = new GoogleSpreadsheet(this.creds.target_sheet_id);
    }

    * authSheets() {
        return new Promise(((resolve, reject) => {
            const creds = {
                private_key: this.creds.private_key.replace(/\\n/g, '\n'),
                client_email: this.creds.client_email
            };
            this.doc.useServiceAccountAuth(creds, (err, result) => {
                if (err) {
                    return reject(err);
                }
                resolve(result);
            });
        }));
    }

    * updateSheet(user) {
        try {
            yield this.authSheets(this.creds);
            const result = yield this.checkRows();
            for (let i = 0; i < result.length; i++) {
                // eslint-disable-next-line no-underscore-dangle
                if (result[i]._value === user.email) {
                    logger.info('User already exists. Updating....');
                    yield this.updateCells(result[i], user);
                    return;
                }
            }
            logger.debug(`[GoogleSheetsService - updateSheet] Done looking for existing users, entering sign up part.`);
            if (user.signup === 'true' || user.signup === true) {
                logger.info('User does not exist. Adding....');
                const newRow = {
                    agreed_to_test: 'yes',
                    'Date First Added': this.getDate(),
                    Email: user.email,
                    Source: 'GFW Feedback Form'
                };
                yield this.addRow(newRow, this.creds.target_sheet_index);
            }
            logger.debug(`[GoogleSheetsService - updateSheet] Finished Google Sheets.`);
        } catch (err) {
            logger.error(err);
        }
    }

    * updateCells(row, user) {
        try {
            logger.info('Getting user....');
            return new Promise(((resolve, reject) => {
                this.doc.getRows(this.creds.target_sheet_index, {
                    offset: row.row - 1,
                    limit: 1
                    // eslint-disable-next-line consistent-return
                }, (err, callbackRow) => {
                    if (err) {
                        return reject(err);
                    }
                    logger.info('Found user....');
                    callbackRow[0].source = 'GFW Feedback form';
                    callbackRow[0].agreedtotest = user.signup === 'true' ? 'yes' : 'no';
                    callbackRow[0].save(() => {
                        logger.info('User updated');
                        resolve(callbackRow);
                    });
                });
            }));
        } catch (err) {
            logger.debug(err);
        }
    }

    * addRow(row, index) {
        try {
            logger.debug('Adding new row...');
            return new Promise(((resolve, reject) => {
                this.doc.addRow(index, row, (err, rowResult) => {
                    logger.debug(`[GoogleSheetsService - updateSheet] Attempt to add row finished.`);
                    if (err) {
                        logger.warn(`[GoogleSheetsService - updateSheet] Could not add row to spreadsheet: ${err.message}`);
                        return reject(err);
                    }
                    logger.debug(`[GoogleSheetsService - updateSheet] Successfully added row to spreadsheet.`);
                    resolve(rowResult);
                });
            }));
        } catch (err) {
            logger.debug(err);
        }
    }

    * checkRows() {
        try {
            logger.debug('checking rows....');
            return new Promise(((resolve, reject) => {
                this.doc.getCells(this.creds.target_sheet_index, {
                    'min-col': 5,
                    'max-col': 5
                }, (err, result) => {
                    if (err) {
                        return reject(err);
                    }
                    logger.debug(`[GoogleSheetsService - checkRows] Found ${result.length} results.`);
                    resolve(result);
                });
            }));
        } catch (err) {
            logger.debug(err);
        }
    }

    // eslint-disable-next-line class-methods-use-this
    getDate() {
        let today = new Date();
        let dd = today.getDate();
        let mm = today.getMonth() + 1; // January is 0!

        const yyyy = today.getFullYear();
        if (dd < 10) {
            dd = `0${dd}`;
        }
        if (mm < 10) {
            mm = `0${mm}`;
        }
        today = `${mm}/${dd}/${yyyy}`;
        return today;
    }

}

module.exports = new GoogleSheetsService();
