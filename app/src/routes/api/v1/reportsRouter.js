'use strict';
const Router = require('koa-router');
const logger = require('logger');
const ErrorSerializer = require('serializers/errorSerializer');
const ReportsSerializer = require('serializers/reportsSerializer');
const ReportsModel = require('models/reportsModel');
const ReportsValidator = require('validators/reportsValidator');
const AnswersModel = require('models/answersModel');
const passThrough = require('stream').PassThrough;
const json2csv = require('json2csv');

const router = new Router({
    prefix: '/reports'
});

class ReportsRouter {

    static * getAll(){
        logger.info('Obtaining all reports');
        let reportsModels;
        if (this.state.query) {
            let filter = [];
            Object.keys(this.state.query).forEach((key) => {
                let queryObj = {};
                queryObj[key] = this.state.query[key];
                filter.push(queryObj);
            });
            reportsModels = yield ReportsModel.find({
                $and: filter
            });
        } else {
            reportsModels = yield ReportsModel.find();
        }
        this.body = ReportsSerializer.serialize(reportsModels);
    }

    static * get(){
        logger.info(`Obtaining reports with id ${this.params.id}`);
        const report = yield ReportsModel.find({ _id: this.params.id });
        this.body = ReportsSerializer.serialize(report);
    }

    static * save(){
        logger.info('Saving reports', this.request.body);
        const request = this.request.body;
        const report = yield new ReportsModel({
            name: request.name,
            areaOfInterest: request.areaOfInterest,
            user: this.state.loggedUser.id,
            languages: request.languages,
            defaultLanguage: request.defaultLanguage,
            questions: request.questions
        }).save();
        this.body = ReportsSerializer.serialize(report);
    }

    static * update(){
        this.throw(500, 'Not implemented');
        return;
    }

    static * delete(){
        logger.info(`Deleting report with id ${this.params.id}`);
        const result = yield ReportsModel.remove({ _id: this.params.id });
        if (!result || !result.result || result.result.ok === 0) {
            this.throw(404, 'Report not found');
            return;
        }
        this.body = '';
        this.statusCode = 204;
    }

    static * downloadAnswers() {
        logger.info(`Downloading answers for report ${this.params.id}`);
        this.set('Content-disposition', `attachment; filename=${this.params.id}.csv`);
        this.set('Content-type', 'text/csv');
        this.body = passThrough();

        const report = yield ReportsModel.findById(this.params.id);
        const questions = {};
        if (!report) {
            this.throw(404, 'Report not found');
            return;
        }
        for (let i = 0, length = report.questions.length; i < length; i++) {
            const question = report.questions[i];
            questions[question.name] = null;
            if (question.childQuestions){
                for (let j = 0, lengthChild = question.childQuestions.length; j < lengthChild; j++ ){
                    questions[question.childQuestions[j].name] = null;
                }
            }
        }
        const answers = yield AnswersModel.find({
            report: this.params.id
        });
        logger.debug('Obtaining data');
        if (answers) {
            logger.debug('Data found!');
            let data = null;

            for (let i = 0, length = answers.length; i < length; i++) {
                const answer = answers[i];
                const responses = Object.assign({}, questions);
                for(let j = 0, lengthResponses = answer.responses.length; j < lengthResponses; j++){
                    const res = answer.responses[j];
                    responses[res.question.name] = res.answer.value;
                }
                logger.debug('Writting...');
                data = json2csv({
                    data: responses,
                    hasCSVColumnTitle: i === 0
                }) + '\n';
                this.body.write(data);
            }
        }
        this.body.end();
    }
}

function * loggedUserToState(next) {
    if (this.query && this.query.loggedUser){
        this.state.loggedUser = JSON.parse(this.query.loggedUser);
        delete this.query.loggedUser;
    } else if (this.request.body && this.request.body.loggedUser) {
        this.state.loggedUser = this.request.body.loggedUser;
        delete this.request.body.loggedUser;
    } else {
        this.throw(401, 'Not logged');
        return;
    }
    yield next;
}

function * queryToState(next) {
    if (this.request.query && Object.keys(this.request.query).length > 0){
        this.state.query = this.request.query;
    }
    yield next;
}

function * checkPermission(next) {
    if (this.state.loggedUser.role === 'USER' || (this.state.loggedUser.role==='MANAGER' && (!this.state.loggedUser.extraUserData || this.state.loggedUser.extraUserData.apps || this.state.loggedUser.extraUserData.apps.indexOf('gfw') === -1))) {
        this.throw(403, 'Not authorized');
        return;
    }
    yield next;
}

function* checkAdmin(next) {
    if (!this.state.loggedUser) {
        this.throw(403, 'Not authorized');
        return;
    }
    yield next;
}

router.post('/', loggedUserToState, ReportsValidator.create, ReportsRouter.save);
router.patch('/:id', loggedUserToState, checkPermission, ReportsValidator.update, ReportsRouter.update);
router.get('/', loggedUserToState, queryToState, ReportsRouter.getAll);
router.get('/:id', loggedUserToState, queryToState, ReportsRouter.get);
router.delete('/:id', loggedUserToState, checkPermission, ReportsRouter.delete);
router.get('/:id/download-answers', loggedUserToState, ReportsRouter.downloadAnswers);

module.exports = router;
