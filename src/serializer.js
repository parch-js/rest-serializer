"use strict";

import inflect from "inflect";

import JSONSerializer from "@parch-js/json-serializer";

const addToObject = function addToObject(obj, key, value) {
  obj[key] = value;
};

/**
 * @class RestSerializer
 * @extends <a href="https://github.com/parch-js/json-serializer" target="_blank">JSONSerializer</a>
 * @constructor
 */
export default class RestSerializer extends JSONSerializer {
  /**
   * Returns an array of ids for a give hasMany/belongsToMany relatioship
   *
   * @method getRelationships
   * @param {Object} instance Sequelize model instance
   * @param {Object} association Sequelize model instance
   * @return {Promise}<Array>
   *
   * @example
   * ```javascript
   * return orm.findOne("user", 1).then(user => {
   *   return serializer.getRelationships(user, user.Model.associations.Project);
   * }).then(relationships => {
   *   /**
   *    * [1, 2, 3]
   *    *
   * });
   * ```
   */
  async getRelationships(instance, association) {
    const accessors = association.accessors;
    const isManyRelationship = Object.keys(accessors).some(accessor => {
      const hasManyRelationshipAccessor = [
        "add",
        "addMultiple",
        "count",
        "hasSingle",
        "hasAll",
        "removeMultiple"
      ].some(valid => valid === accessor);

      return hasManyRelationshipAccessor;
    });

    if (isManyRelationship) {
      const relationships = await instance[accessors.get]();

      return relationships.map(relationship => relationship.id);
    } else {
      return Promise.resolve([]);
    }
  }

  /**
   * Returns the name string for the record
   *
   * @method keyForRecord
   * @param {Object} instance sequelize model instance
   * @param {Boolean} singular singular or plural name
   * @return {String} name string for record root
   *
   * @example
   * ```javascript
   * return orm.findOne("user", 1).then(user => {
   *   const res = {};
   *   const resKey = serializer.keyForRecord(user, true);
   *
   *   res[resKey] = user.toJSON();
   *
   *   return res;
   * });
   * ```
   */
  keyForRecord(instance, singular) {
    const tableName = instance.constructor.getTableName();
    const recordKey = tableName.toLowerCase();

    if (singular) { return inflect.singularize(recordKey); }

    return inflect.pluralize(recordKey);
  }

  /**
   * Return the object key for a relationship
   *
   * @method keyForRelationship
   * @param {String} relationship the relationship name (e.g. `Projects`)
   * @return {String} name string for the relationship
   *
   * @example
   * ```javascript
   * return serializer.keyForRelationship("Projects").then(key => {
   *   // "projects"
   * });
   * ```
   */
  keyForRelationship(relationship) {
    return inflect.pluralize(relationship.toLowerCase());
  }

  /**
   * Takes an array of Sequelize instances and returns an object with a root key
   * based on the model name and an array of pojo records
   *
   * @method normalizeArrayResponse
   * @param {Array} instances Sequelize instances
   * @return {Promise}<Object, Error>
   *
   * @example
   * ```javascript
   * return orm.findAll("user").then(users => {
   *   return serializer.normalizeArrayResponse(instances);
   * }).then(response => {
   *   /**
   *    * {
   *    *   users: [{
   *    *   }]
   *    * }
   * });
   * ```
   */
  async normalizeArrayResponse(instances, fallbackName) {
    let key;

    if (!instances || !instances.length) {
      key = inflect.camelize(inflect.pluralize(fallbackName), false);

      const response = {
        [key]: []
      };

      return response;
    }

    const records = [];

    for (const instance of instances) {
      key = key || this.keyForRecord(instance, false);
      records.push((await this.normalizeRelationships(instance, instance)));
    }

    return this._defineArrayResponse(key, records);
  }

  /**
   * Takes a single Sequelize instance and returns an object with a root key based
   * on the model name and a pojo record
   *
   * @method normalizeSingularResponse
   * @param {Object} instance Sequelize model instance
   * @return {Promise}<Object, Error>
   *
   * @example
   * ```javascript
   * return orm.findOne("user", 1).then(user => {
   *   return serializer.normalizeSingularResponse(instance, "findOne");
   * }).then(response => {
   *   /**
   *    * {
   *    *   user: {
   *    *   }
   *    * }
   * });
   * ```
   */
  async normalizeSingularResponse(instance) {
    const key = this.keyForRecord(instance, true);
    const record = await this.normalizeRelationships(instance, instance);

    return this._defineSingularResponse(key, record);
  }

  /**
   * @method normalizeRelationships
   * @param {Object} instance Sequelize model instance
   * @param {Object} payload Pojo representation of Sequelize model instance
   * @return {Promis}<Object, Error>
   *
   * @example
   * ```javascript
   * return store.findOne("user", 1).then(user => {
   *   return serializer.normalizeRelationships(user, user.toJSON());
   * }).then(response => {
   *   /**
   *    * {
   *    *   user: {
   *    *     projects: [1, 2, 3]
   *    *   }
   *    * }
   * });
   * ```
   */
  async normalizeRelationships(instance, payload) {
    const associations = instance.constructor.associations;

    for (const associationKey in associations) {
      if (associations.hasOwnProperty(associationKey)) {
        const key = this.keyForRelationship(associationKey);
        const relationships = await this.getRelationships(instance, associations[associationKey]);

        addToObject(payload, key, relationships);
      }
    }

    return payload;
  }

  /**
   * Overwrites the .toJSON method to attach relationships.
   *
   * @method _cloneArrayRecordForJSON
   * @param {String} key the resource key (e.g. 'users')
   * @param {Object} payload formatted array response object
   * @return {Object} payload
   *
   * @example
   * ```
   * const record = serializer._cloneArrayRecordForJSON('users', {
   *   users: SequelizeInstance[]
   * });
   *
   * /** {
   *  *    "users": SequelizeInstance[]
   *  *  }
   * ```
   */
  _cloneArrayResponseForJSON(key, payload) {
    const recordArray = payload[key];
    const recordArrayCopy = recordArray.map(record => {
      const associations = record.constructor.associations;
      const recordCopy = {};

      Object.keys(associations).forEach(association => {
        const associationKey = this.keyForRelationship(association);

        if (record[associationKey]) {
          recordCopy[associationKey] = record[associationKey];
        }
      });

      const plainInstance = record.toJSON();

      Object.keys(plainInstance).forEach(property => {
        recordCopy[property] = plainInstance[property];
      });

      return recordCopy;
    });

    return {
      [key]: recordArrayCopy
    };
  }

  /**
   * @method _cloneSingularResponseForJSON
   * @param {String} key the resource key (e.g. 'user')
   * @param {Object} payload formatted singular response object
   * @return {Object} payload
   *
   * @example
   * ```
   * const record = serializer._cloneSingularRecordForJSON('user', {
   *   user: SequelizeInstance
   * });
   *
   * /** {
   *  *    "user": SequelizeInstance
   *  *  }
   * ```
   */
  _cloneSingularResponseForJSON(key, record) {
    const instance = record[key];
    const associations = instance.constructor.associations;
    const recordClone = {};

    Object.keys(associations).forEach(association => {
      const associationKey = this.keyForRelationship(association);

      if (instance[associationKey]) {
        recordClone[associationKey] = instance[associationKey];
      }
    });

    const plainInstance = instance.toJSON();

    Object.keys(plainInstance).forEach(property => {
      recordClone[property] = plainInstance[property];
    });

    return {
      [key]: recordClone
    };
  }

  /**
   * Reformats the record into a RESTful object with the record name as the key.
   * In addition, this will add a custom toJSON method on the response object
   * that will serialize the response when sent through something like
   * express#res.send, retaining the relationships on the instance, but removing
   * all other extraneous data (see <a href="https://github.com/sequelize/sequelize/blob/16864699e0cc4b5fbc5bbf742b7a15eea9948e77/lib/model.js#L4005" target="_bank">Sequelize instance#toJSON</a>)
   *
   * @method _defineArrayResponse
   * @private
   * @param {String} key the name of the record (e.g. users)
   * @param {Array<Object>} records Array of sequelize instances
   * @returns {Object}
   *
   * @example
   * ```javascript
   * serializer._defineArrayResponse("users", [{
   *   dataValues: {
   *     firstName: "Hank",
   *     lastName: "Hill",
   *     projects: [1, 2]
   *   },
   *   someExtraneousProp: "foo"
   * }]);
   *
   * /**
   *  * {
   *  *   users: [{
   *  *     dataValues: {
   *  *       firstName: "Hank",
   *  *       lastName: "Hill",
   *  *       projects: [1, 2],
   *  *     },
   *  *     someExtraneousProp: "foo",
   *  *     toJSON() {
   *  *     }
   *  *   }]
   *  * }
   *  *
   *  * response.toJSON()
   *  *
   *  * {
   *  *   "users": [{
   *  *     firstName: "Hank",
   *  *     lastName: "Hill",
   *  *     projects: [1, 2],
   *  *   }]
   *  * }
   * ```
   */
  _defineArrayResponse(key, records) {
    const response = {};

    Object.defineProperty(response, key, {
      configurable: false,
      enumerable: true,
      value: records
    });

    Object.defineProperty(response, "toJSON", {
      configurable: false,
      enumerable: false,
      value: this._cloneArrayResponseForJSON.bind(this, key, response)
    });

    return response;
  }

  /**
   * Similar to {{#crossLink "RestSerializer/_defineArrayResponse:method"}}_defineArrayResponse{{/crossLink}},
   * the difference being that this takes a single record and returns a singular response
   *
   * @method _defineSingularResponse
   * @private
   * @param {String} key the name of the record (e.g. users)
   * @param {Object} record Sequelize instance
   * @returns {Object}
   *
   * @example
   * ```javascript
   * serializer._defineSingularResponse("user", {
   *   dataValues: {
   *     firstName: "Hank",
   *     lastName: "Hill",
   *     projects: [1, 2]
   *   },
   *   someExtraneousProp: "foo",
   * });
   *
   * /**
   *  * {
   *  *   user: {
   *  *     dataValues: {
   *  *       firstName: "Hank",
   *  *       lastName: "Hill",
   *  *       projects: [1, 2],
   *  *     someExtraneousProp: "foo",
   *  *     toJSON() {
   *  *     }
   *  *   }
   *  * }
   *  *
   *  * response.toJSON()
   *  *
   *  * {
   *  *   "user": [{
   *  *     "firstName": "Hank",
   *  *     "lastName": "Hill",
   *  *     "projects": [1, 2],
   *  *   }]
   *  * }
   * ```
   */
  _defineSingularResponse(key, record) {
    const response = {};

    Object.defineProperty(response, key, {
      configurable: false,
      enumerable: true,
      value: record
    });

    Object.defineProperty(response, "toJSON", {
      configurable: false,
      enumerable: false,
      value: this._cloneSingularResponseForJSON.bind(this, key, response)
    });

    return response;
  }
}
