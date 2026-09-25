const { success } = require('../utils/response');

function createCrudController(model, resourceName) {
  return {
    list: async (req, res, next) => { try { return success(res, `${resourceName} retrieved successfully`, await model.list()); } catch (error) { return next(error); } },
    get: async (req, res, next) => { try { const record = await model.findById(req.params.id); if (!record) return res.status(404).json({ success: false, message: `${resourceName} not found` }); return success(res, `${resourceName} retrieved successfully`, record); } catch (error) { return next(error); } },
    create: async (req, res, next) => { try { return success(res, `${resourceName} created successfully`, await model.create(req.body), 201); } catch (error) { return next(error); } },
    update: async (req, res, next) => { try { return success(res, `${resourceName} updated successfully`, await model.update(req.params.id, req.body)); } catch (error) { return next(error); } },
    remove: async (req, res, next) => { try { return success(res, `${resourceName} deleted successfully`, await model.remove(req.params.id)); } catch (error) { return next(error); } }
  };
}

module.exports = createCrudController;