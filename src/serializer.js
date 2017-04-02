import inflect from "inflect";

export default class RestSerializer {
  keyForRecord(instance, singular) {
    const tableName = instance.Model.getTableName();
    const recordKey = tableName.toLowerCase();

    if (singular) { return inflect.singularize(recordKey); }

    return inflect.pluralize(recordKey);
  }

  keyForRelationship(relationship) {
    return inflect.pluralize(relationship.toLowerCase());
  }

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

  normalizeResponse(instance, method) {
    switch (method) {
      case "createRecord":
      case "findOne":
      case "updateRecord":
        return this.normalizeSingularResponse(instance);
      case "findAll":
        return this.normalizeArrayResponse(instance);
    }
  }

  async normalizeSingularResponse(instance) {
    const json = instance.toJSON();
    const key = this.keyForRecord(instance, true);
    const response = { [key]: json }

    await this.normalizeRelationships(instance, response[key]);

    return response;
  }

  async getRelationships(instance, payload, association) {
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

  async normalizeRelationships(instance, payload) {
    const associations = instance.Model.associations;

    for (const association in associations) {
      const relationship = await this.getRelationships(
        instance,
        payload,
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
