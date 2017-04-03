import inflect from "inflect";

/**
 * @class RestSerializer
 * @constructor
 */
export default class RestSerializer {
  /**
   * Returns an array of ids for a give hasMany/belongsToMany relatioship
   *
   * @method getRelationships
   * @param {Object} instance Sequelize model instance
   * @param {Object} association Sequelize model instance
   * @return {Array}
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
      return [
        "add",
        "addMultiple",
        "count",
        "hasSingle",
        "hasAll",
        "removeMultiple"
      ].some(valid => valid === accessor);
    });

    if (isManyRelationship) {
      const relationships = await instance[association.accessors.get]();

      return relationships.map(relationship => relationship.id);
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
    const tableName = instance.Model.getTableName();
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
  async normalizeArrayResponse(instances) {
    const records = [];
    const response = {};
    let key;

    for (const instance of instances) {
      const json = instance.toJSON();

      await this.normalizeRelationships(instance, json);

      records.push(json);

      if (!key) {
        key = this.keyForRecord(instance, false);
      }
    }

    response[key] = records;

    return response;
  }

  /**
   * Takes a single Sequelize instance and returns an object with a root key based
   * on the model name and a pojo record
   *
   * @method normalizeResponse
   * @param {Object} instance
   * @param {String} method
   * @return {Promise}<Object, Error>
   *
   * @example
   * ```javascript
   * return orm.findOne("user", 1).then(user => {
   *   return serializer.normalizeResponse(instance, "findOne");
   * }).then(response => {
   *   /**
   *    * {
   *    *   user: {
   *    *   }
   *    * }
   * })
   * ```
   */
  async normalizeResponse(instance, method) {
    switch (method) {
      case "createRecord":
      case "findOne":
      case "updateRecord":
        return this.normalizeSingularResponse(instance);
      case "findAll":
        return this.normalizeArrayResponse(instance);
    }
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
    const json = instance.toJSON();
    const key = this.keyForRecord(instance, true);
    const response = { [key]: json }

    await this.normalizeRelationships(instance, response[key]);

    return response;
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
    const associations = instance.Model.associations;

    for (const association in associations) {
      const relationship = await this.getRelationships(
        instance,
        associations[association]
      );
      const relationshipKey = this.keyForRelationship(association);

      if (relationship) {
        payload[relationshipKey] = relationship;
      }
    }

    return payload;
  }
}
